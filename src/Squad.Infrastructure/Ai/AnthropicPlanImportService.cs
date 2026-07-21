using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Squad.Core;

namespace Squad.Infrastructure;

/// <summary>
/// <see cref="IPlanImportService"/> backed by the Anthropic Messages API. The uploaded PDF is sent
/// to Claude as a native document block (no server-side PDF parsing) with a strict extraction prompt,
/// and the model returns the plan as JSON in the CoachPlan editor's schema. We then re-build that JSON
/// from scratch server-side (<see cref="Normalize"/>) so the client can always load it even if the model
/// drifts on shapes — days, sport names, durations and ids are coerced to exactly what the editor expects.
///
/// Not configured (no API key) ⇒ <see cref="Configured"/> is false and the endpoint reports it honestly
/// rather than fabricating a plan. Set Ai:Anthropic:ApiKey (and optionally Ai:Anthropic:Model) in config.
/// </summary>
public sealed class AnthropicPlanImportService : IPlanImportService
{
    private const string Endpoint = "https://api.anthropic.com/v1/messages";
    private const string ApiVersion = "2023-06-01";
    private const int MaxTokens = 24000; // a detailed 12-week plan can be large; avoid mid-JSON truncation

    private static readonly string[] Days = { "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun" };
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly HttpClient _http;
    private readonly string? _apiKey;
    private readonly string _model;
    private readonly ILogger<AnthropicPlanImportService> _log;

    public AnthropicPlanImportService(HttpClient http, string? apiKey, string? model, ILogger<AnthropicPlanImportService> log)
    {
        _http = http;
        _apiKey = string.IsNullOrWhiteSpace(apiKey) ? null : apiKey.Trim();
        _model = string.IsNullOrWhiteSpace(model) ? "claude-sonnet-5" : model.Trim();
        _log = log;
    }

    public bool Configured => _apiKey is not null;

    public async Task<PlanImportResult> ImportAsync(
        byte[] pdfBytes, string fileName, string anchorType, string? anchorDate, CancellationToken ct)
    {
        if (_apiKey is null)
            return PlanImportResult.Fail("AI plan import isn't configured on the server.");
        if (pdfBytes is null || pdfBytes.Length == 0)
            return PlanImportResult.Fail("The PDF was empty.");

        var anchor = anchorType == "target" ? "target" : "start";
        var content = new object[]
        {
            new { type = "document", source = new { type = "base64", media_type = "application/pdf", data = Convert.ToBase64String(pdfBytes) } },
            new { type = "text", text = ImportUserPrompt(anchor, anchorDate) },
        };

        var (text, fail) = await CompleteAsync(SchemaSystemPrompt, content, "import", ct);
        if (fail is not null) return PlanImportResult.Fail(fail);
        if (!TryExtractJson(text!, out var modelJson))
            return PlanImportResult.Fail("Couldn't read a plan out of that PDF. Is it a training plan?");

        return BuildResult(modelJson, anchor, anchorDate, SanitizeName(System.IO.Path.GetFileNameWithoutExtension(fileName)), "import");
    }

    public async Task<PlanImportResult> GeneratePlanAsync(PlanSpec spec, CancellationToken ct)
    {
        if (_apiKey is null)
            return PlanImportResult.Fail("AI plan generation isn't configured on the server.");

        var content = new object[] { new { type = "text", text = GenerateUserPrompt(spec) } };
        var (text, fail) = await CompleteAsync(SchemaSystemPrompt, content, $"generate {spec.Key}", ct);
        if (fail is not null) return PlanImportResult.Fail(fail);
        if (!TryExtractJson(text!, out var modelJson))
            return PlanImportResult.Fail("The AI didn't return a plan.");

        // Templates carry no athlete date; the adopter sets start/target when they take the plan.
        return BuildResult(modelJson, "start", null, spec.Title, $"generate {spec.Key}");
    }

    // Shared: parse the model's JSON into our editor doc shape.
    private PlanImportResult BuildResult(string modelJson, string anchor, string? anchorDate, string fallbackName, string op)
    {
        try
        {
            using var parsed = JsonDocument.Parse(modelJson);
            var (doc, name) = Normalize(parsed.RootElement, anchor, anchorDate, fallbackName);
            return PlanImportResult.Success(doc, name);
        }
        catch (JsonException ex)
        {
            _log.LogWarning(ex, "Anthropic {Op} produced invalid JSON", op);
            return PlanImportResult.Fail("The AI response wasn't valid. Try again.");
        }
    }

    // Shared: one Messages API call. Returns (text, null) on success or (null, friendlyError) on any
    // failure — HTTP error, timeout, or a 200 with no text (logged with stop_reason + raw for diagnosis).
    private async Task<(string? text, string? fail)> CompleteAsync(
        string systemPrompt, object[] userContent, string op, CancellationToken ct)
    {
        var body = new
        {
            model = _model,
            max_tokens = MaxTokens,
            system = systemPrompt,
            messages = new object[] { new { role = "user", content = userContent } },
        };

        AnthropicResponse? resp;
        string rawJson = "";
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, Endpoint) { Content = JsonContent.Create(body) };
            req.Headers.TryAddWithoutValidation("x-api-key", _apiKey);
            req.Headers.TryAddWithoutValidation("anthropic-version", ApiVersion);
            req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            using var res = await _http.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode)
            {
                var raw = await res.Content.ReadAsStringAsync(ct);
                _log.LogWarning("Anthropic {Op} failed: {Status} {Body}", op, (int)res.StatusCode, Truncate(raw, 500));
                return (null, FriendlyError((int)res.StatusCode, raw));
            }

            rawJson = await res.Content.ReadAsStringAsync(ct);
            resp = JsonSerializer.Deserialize<AnthropicResponse>(rawJson, Json);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw; // caller/host actually aborted — let it propagate
        }
        catch (OperationCanceledException)
        {
            _log.LogWarning("Anthropic {Op} timed out after {Seconds}s", op, _http.Timeout.TotalSeconds);
            return (null, "The AI took too long. Try again.");
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Anthropic {Op} request errored", op);
            return (null, "Couldn't reach the AI service. Try again.");
        }

        var text = resp?.Text();
        if (string.IsNullOrWhiteSpace(text))
        {
            // 200 OK but no text block — capture stop_reason, content block types, and the first chunk
            // of the raw body so the actual cause is visible in the logs.
            _log.LogWarning("Anthropic {Op} returned no text. stop_reason={Stop} types=[{Types}] raw={Raw}", op,
                resp?.StopReason ?? "(none)",
                resp?.Content is null ? "(null content)" : string.Join(",", resp.Content.Select(b => b.Type ?? "?")),
                Truncate(rawJson, 1200));
            return (null, "The AI returned an empty response. Try again.");
        }
        return (text, null);
    }

    // ── prompts ──────────────────────────────────────────────────────────────

    private const string SchemaSystemPrompt = """
        You produce a strict JSON training plan for an endurance/triathlon coaching app. Whether you are
        transcribing an uploaded plan or building a new one, the output must be a single JSON object in the
        schema below and NOTHING else — no prose, no markdown fences. When transcribing, preserve every
        session exactly (same weeks, days, sports, durations, intensities, notes) — never invent, summarise,
        merge, reorder or drop sessions. When building a new plan, make it realistic and coach-credible.

        Schema:
        {
          "planName": string,              // the plan's title
          "totalWeeks": integer,           // number of weeks in the plan
          "weeks": {                       // keyed by week number as a string: "1" .. "N"
            "1": {
              "title": string,             // e.g. "Base 1"  ("" if none)
              "targetHrs": string,         // weekly target hours as text  ("" if none)
              "targetLoad": string,        // weekly target load/TSS as text  ("" if none)
              "focus": string,             // one-line focus of the week  ("" if none)
              "sessions": {                // keyed by day: Mon Tue Wed Thu Fri Sat Sun
                "Mon": [
                  { "sport": "Bike|Swim|Run|Gym|Rest", "title": string, "dur": "H:MM",
                    "load": number, "z": string, "note": string }
                ]
              }
            }
          }
        }

        Rules:
        - sport is EXACTLY one of: Bike, Swim, Run, Gym, Rest.
        - dur is duration as "H:MM" (e.g. "1:15"). If only minutes are given, convert (75 -> "1:15"). "" if truly unknown.
        - load is an integer training load/TSS if the plan states one, otherwise 0.
        - z ("target zone") holds the intensity/zone/pace/power/HR target text. note holds the coach's extra
          description/guidance. Between title, z and note, capture the FULL workout — never lose detail.
        - A rest day is a single { "sport": "Rest", ... } session. A day with nothing scheduled can be omitted.
        - Keep the plan's own week/day structure. If the plan is a flat list of days or dates, group them into
          consecutive 7-day weeks in order and map each day onto Mon..Sun within its week.
        """;

    private static string ImportUserPrompt(string anchor, string? anchorDate)
    {
        var when = string.IsNullOrWhiteSpace(anchorDate)
            ? "The athlete gave no anchor date."
            : anchor == "target"
                ? $"The athlete set the goal/race day to {anchorDate}; the plan builds toward it."
                : $"The athlete set the plan's week 1 to begin on {anchorDate}.";
        return $"Import this training plan into the JSON schema. {when} Return only the JSON object now.";
    }

    private static string GenerateUserPrompt(PlanSpec spec) => $"""
        Build a complete, realistic {spec.Weeks}-week {spec.Distance} training plan for an athlete targeting
        {spec.GoalLabel}. Focus: {spec.Focus}.

        Requirements:
        - Exactly {spec.Weeks} weeks, keyed "1".."{spec.Weeks}", progressing sensibly: build phase(s) with
          rising load, a peak, then a taper in the final 1-2 weeks. Include recovery/down weeks (roughly every
          3rd-4th week). The last week ends on race day.
        - Each week: set title (e.g. "Base 2", "Peak", "Taper", "Race week"), a realistic weekly targetHrs,
          a focus line, and daily sessions. Include at least one rest day per week.
        - Make sessions specific and coach-credible for the {spec.GoalLabel} goal: real workout structure in
          the title/z/note (e.g. intervals with paces/zones, tempo, long endurance, bricks for triathlon).
          Put pace/power/HR/zone targets in "z" and extra guidance in "note".
        - For triathlon distances (70.3, 140.6) balance Swim, Bike and Run across the week and include brick
          sessions; for run distances (5K/10K/Half/Marathon) centre on Run with optional Gym for strength.
        - Set planName to "{spec.Distance} — {spec.GoalLabel} ({spec.Weeks} weeks)".

        Return only the JSON object now.
        """;

    // ── normalisation: rebuild the editor doc from whatever the model returned ──

    private (string doc, string name) Normalize(JsonElement root, string anchor, string? anchorDate, string fallbackName)
    {
        var planName = Str(root, "planName");
        if (string.IsNullOrWhiteSpace(planName)) planName = fallbackName;
        planName = SanitizeName(planName);

        var weeks = new Dictionary<string, object?>();
        int weekCount = 0;

        if (root.TryGetProperty("weeks", out var weeksEl))
        {
            // Accept both the keyed-object form {"1":{…}} and an array [ {…}, … ].
            IEnumerable<(string key, JsonElement val)> entries = weeksEl.ValueKind switch
            {
                JsonValueKind.Object => EnumObject(weeksEl),
                JsonValueKind.Array => EnumArray(weeksEl),
                _ => Array.Empty<(string, JsonElement)>(),
            };

            foreach (var (key, wEl) in entries)
            {
                if (wEl.ValueKind != JsonValueKind.Object) continue;
                weekCount++;
                var wn = int.TryParse(key, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) && n > 0
                    ? n
                    : weekCount;

                weeks[wn.ToString(CultureInfo.InvariantCulture)] = new Dictionary<string, object?>
                {
                    ["title"] = Str(wEl, "title"),
                    ["targetHrs"] = Str(wEl, "targetHrs"),
                    ["targetLoad"] = Str(wEl, "targetLoad"),
                    ["focus"] = Str(wEl, "focus"),
                    ["sessions"] = NormalizeSessions(wEl),
                };
            }
        }

        var totalWeeks = root.TryGetProperty("totalWeeks", out var twEl) && twEl.TryGetInt32(out var tw) && tw > 0
            ? tw
            : weekCount;

        var doc = new Dictionary<string, object?>
        {
            ["planName"] = planName,
            ["anchorType"] = anchor,
            ["anchorDate"] = string.IsNullOrWhiteSpace(anchorDate) ? "" : anchorDate,
            ["totalWeeks"] = totalWeeks == 0 ? "" : (object)totalWeeks,
            ["weeks"] = weeks,
            ["assigned"] = new Dictionary<string, object?>(),
        };

        return (JsonSerializer.Serialize(doc, Json), planName);
    }

    private Dictionary<string, object?> NormalizeSessions(JsonElement weekEl)
    {
        var outSessions = new Dictionary<string, object?>();
        if (!weekEl.TryGetProperty("sessions", out var sessEl) || sessEl.ValueKind != JsonValueKind.Object)
            return outSessions;

        foreach (var (rawDay, dayArr) in EnumObject(sessEl))
        {
            var day = CanonicalDay(rawDay);
            if (day is null || dayArr.ValueKind != JsonValueKind.Array) continue;

            var list = new List<object?>();
            foreach (var sEl in dayArr.EnumerateArray())
            {
                if (sEl.ValueKind != JsonValueKind.Object) continue;
                list.Add(new Dictionary<string, object?>
                {
                    ["id"] = Guid.NewGuid().ToString("N")[..10],
                    ["sport"] = CanonicalSport(Str(sEl, "sport")),
                    ["title"] = Trunc(Str(sEl, "title"), 200),
                    ["dur"] = CanonicalDur(sEl),
                    ["load"] = LoadValue(sEl),
                    ["z"] = Trunc(Str(sEl, "z"), 200),
                    ["note"] = Trunc(Str(sEl, "note"), 2000),
                });
            }
            if (list.Count > 0) outSessions[day] = list;
        }
        return outSessions;
    }

    // ── coercion helpers ───────────────────────────────────────────────────────

    private static string CanonicalSport(string? sport) => (sport ?? "").Trim().ToLowerInvariant() switch
    {
        "bike" or "cycle" or "cycling" or "ride" => "Bike",
        "swim" or "swimming" => "Swim",
        "run" or "running" or "jog" => "Run",
        "gym" or "strength" or "weights" or "s&c" or "core" => "Gym",
        "rest" or "off" or "recovery day" => "Rest",
        _ => "Bike",
    };

    private static string? CanonicalDay(string? raw)
    {
        var d = (raw ?? "").Trim().ToLowerInvariant();
        if (d.Length >= 3) d = d[..3];
        return d switch
        {
            "mon" => "Mon", "tue" => "Tue", "wed" => "Wed", "thu" => "Thu",
            "fri" => "Fri", "sat" => "Sat", "sun" => "Sun",
            _ => null,
        };
    }

    // Accept "H:MM", minutes as number/string, or "1h15"/"90 min" and normalise to "H:MM" (or "" if unknown).
    private static string CanonicalDur(JsonElement s)
    {
        if (!s.TryGetProperty("dur", out var d)) return "";

        if (d.ValueKind == JsonValueKind.Number && d.TryGetDouble(out var mins))
            return MinutesToHMM((int)Math.Round(mins));

        var raw = (d.ValueKind == JsonValueKind.String ? d.GetString() : null)?.Trim();
        if (string.IsNullOrWhiteSpace(raw)) return "";

        if (raw.Contains(':'))
        {
            var p = raw.Split(':');
            if (p.Length >= 2 && int.TryParse(p[0], out var h) && int.TryParse(p[1], out var m))
                return MinutesToHMM(h * 60 + m);
        }

        var digits = new string(Array.FindAll(raw.ToCharArray(), char.IsDigit));
        if (raw.Contains('h', StringComparison.OrdinalIgnoreCase))
        {
            // "1h15" / "1h" style
            var parts = raw.ToLowerInvariant().Split('h');
            int.TryParse(new string(Array.FindAll(parts[0].ToCharArray(), char.IsDigit)), out var hh);
            var mm = 0;
            if (parts.Length > 1) int.TryParse(new string(Array.FindAll(parts[1].ToCharArray(), char.IsDigit)), out mm);
            return MinutesToHMM(hh * 60 + mm);
        }
        if (int.TryParse(digits, out var onlyMins) && onlyMins > 0)
            return MinutesToHMM(onlyMins);

        return "";
    }

    private static string MinutesToHMM(int mins)
    {
        if (mins <= 0) return "";
        mins = Math.Min(mins, 24 * 60);
        return $"{mins / 60}:{mins % 60:D2}";
    }

    private static int LoadValue(JsonElement s)
    {
        if (!s.TryGetProperty("load", out var l)) return 0;
        if (l.ValueKind == JsonValueKind.Number && l.TryGetDouble(out var n))
            return Math.Clamp((int)Math.Round(n), 0, 100_000);
        if (l.ValueKind == JsonValueKind.String &&
            int.TryParse(new string(Array.FindAll((l.GetString() ?? "").ToCharArray(), char.IsDigit)), out var m))
            return Math.Clamp(m, 0, 100_000);
        return 0;
    }

    private static string Str(JsonElement obj, string prop) =>
        obj.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String ? (v.GetString() ?? "") : "";

    private static IEnumerable<(string, JsonElement)> EnumObject(JsonElement el)
    {
        foreach (var p in el.EnumerateObject()) yield return (p.Name, p.Value);
    }

    private static IEnumerable<(string, JsonElement)> EnumArray(JsonElement el)
    {
        int i = 1;
        foreach (var v in el.EnumerateArray()) yield return ((i++).ToString(CultureInfo.InvariantCulture), v);
    }

    private static string SanitizeName(string? name)
    {
        var n = (name ?? "").Trim();
        if (n.Length == 0) return "Imported plan";
        return n.Length > 120 ? n[..120] : n;
    }

    private static string Trunc(string? v, int max)
    {
        v ??= "";
        return v.Length > max ? v[..max] : v;
    }

    // The model is told to emit bare JSON, but strip any stray prose/``` fences and take the outermost object.
    private static bool TryExtractJson(string text, out string json)
    {
        json = "";
        int start = text.IndexOf('{');
        int end = text.LastIndexOf('}');
        if (start < 0 || end <= start) return false;
        json = text[start..(end + 1)];
        return true;
    }

    private static string FriendlyError(int status, string body)
    {
        var detail = "";
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("error", out var e) && e.TryGetProperty("message", out var m))
                detail = m.GetString() ?? "";
        }
        catch { /* non-JSON body */ }

        return status switch
        {
            401 or 403 => "The server's AI credentials were rejected. Check the Anthropic API key.",
            413 => "That PDF is too large for the AI to read.",
            429 => "The AI service is rate-limited right now. Try again shortly.",
            >= 500 => "The AI service is temporarily unavailable. Try again.",
            _ => string.IsNullOrWhiteSpace(detail) ? "The AI couldn't process that PDF." : Truncate(detail, 200),
        };
    }

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max];

    // ── Anthropic response shape (only the bits we read) ──
    private sealed class AnthropicResponse
    {
        [JsonPropertyName("content")] public List<ContentBlock>? Content { get; set; }
        [JsonPropertyName("stop_reason")] public string? StopReason { get; set; }

        public string Text()
        {
            if (Content is null) return "";
            var sb = new StringBuilder();
            foreach (var b in Content)
                if (b.Type == "text" && b.Text is not null) sb.Append(b.Text);
            return sb.ToString();
        }
    }

    private sealed class ContentBlock
    {
        [JsonPropertyName("type")] public string? Type { get; set; }
        [JsonPropertyName("text")] public string? Text { get; set; }
    }
}
