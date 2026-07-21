using System;
using System.Collections.Generic;
using System.Globalization;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Squad.Core;

namespace Squad.Infrastructure;

/// <summary>
/// <see cref="IRaceInfoService"/> backed by the Anthropic Messages API. Given an event
/// URL (the athlete's goal race), we fetch the page ourselves, reduce it to plain text,
/// and ask Claude to pull out the race name, ISO date and location as strict JSON. The
/// server owns the fetch (Claude gets text, not a live browser), so a marketing page or
/// a registration listing both work as long as the details are on the page.
///
/// Not configured (no API key) ⇒ <see cref="Configured"/> is false and the endpoint
/// reports it honestly instead of inventing a race. Set Ai:Anthropic:ApiKey (and
/// optionally Ai:Anthropic:Model) in config — the same key the plan importer uses.
/// </summary>
public sealed class AnthropicRaceInfoService : IRaceInfoService
{
    private const string Endpoint = "https://api.anthropic.com/v1/messages";
    private const string ApiVersion = "2023-06-01";
    private const int MaxTokens = 1024;
    private const int MaxPageChars = 16000; // plenty for an event page; keeps the prompt small

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly HttpClient _http;
    private readonly string? _apiKey;
    private readonly string _model;
    private readonly ILogger<AnthropicRaceInfoService> _log;

    public AnthropicRaceInfoService(HttpClient http, string? apiKey, string? model, ILogger<AnthropicRaceInfoService> log)
    {
        _http = http;
        _apiKey = string.IsNullOrWhiteSpace(apiKey) ? null : apiKey.Trim();
        _model = string.IsNullOrWhiteSpace(model) ? "claude-sonnet-5" : model.Trim();
        _log = log;
    }

    public bool Configured => _apiKey is not null;

    public async Task<RaceInfoResult> ExtractAsync(string url, CancellationToken ct)
    {
        if (_apiKey is null)
            return RaceInfoResult.Fail("AI race lookup isn't configured on the server.");
        if (!TryNormalizeUrl(url, out var uri))
            return RaceInfoResult.Fail("That doesn't look like a valid web address.");

        var pageText = await FetchPageTextAsync(uri, ct);
        if (pageText is null)
            return RaceInfoResult.Fail("Couldn't open that page. Check the link and try again.");

        var today = DateTime.UtcNow.ToString("yyyy-MM-dd");
        var content = new object[]
        {
            new { type = "text", text = UserPrompt(uri.ToString(), today, pageText) },
        };

        var (text, fail) = await CompleteAsync(SystemPrompt, content, ct);
        if (fail is not null) return RaceInfoResult.Fail(fail);
        if (!TryExtractJson(text!, out var json))
            return RaceInfoResult.Fail("Couldn't read the race details from that page.");

        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var name = Clean(Str(root, "name"), 160);
            var date = NormalizeDate(Str(root, "date"));
            var location = Clean(Str(root, "location"), 200);

            if (string.IsNullOrWhiteSpace(name))
                return RaceInfoResult.Fail("That page doesn't look like a race event.");

            return RaceInfoResult.Success(new RaceInfo(name, date, location));
        }
        catch (JsonException ex)
        {
            _log.LogWarning(ex, "Anthropic race-info produced invalid JSON");
            return RaceInfoResult.Fail("The AI response wasn't valid. Try again.");
        }
    }

    // ── fetch + reduce the event page to plain text ──
    private async Task<string?> FetchPageTextAsync(Uri uri, CancellationToken ct)
    {
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, uri);
            // Some event sites 403 a bare client; present as a normal browser.
            req.Headers.TryAddWithoutValidation("User-Agent",
                "Mozilla/5.0 (compatible; SquadBot/1.0; +https://squad.app)");
            req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/html"));

            using var res = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!res.IsSuccessStatusCode)
            {
                _log.LogWarning("Race page {Url} returned {Status}", uri, (int)res.StatusCode);
                return null;
            }
            var html = await res.Content.ReadAsStringAsync(ct);
            return HtmlToText(html);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Race page {Url} fetch failed", uri);
            return null;
        }
    }

    // Strip scripts/styles/tags, collapse whitespace, cap length. Good enough to hand a
    // model — event name/date/location live in visible copy, not markup.
    private static string HtmlToText(string html)
    {
        if (string.IsNullOrEmpty(html)) return "";
        var t = Regex.Replace(html, "<script[\\s\\S]*?</script>", " ", RegexOptions.IgnoreCase);
        t = Regex.Replace(t, "<style[\\s\\S]*?</style>", " ", RegexOptions.IgnoreCase);
        t = Regex.Replace(t, "<!--[\\s\\S]*?-->", " ");
        t = Regex.Replace(t, "<[^>]+>", " ");
        t = System.Net.WebUtility.HtmlDecode(t);
        t = Regex.Replace(t, "\\s+", " ").Trim();
        return t.Length > MaxPageChars ? t[..MaxPageChars] : t;
    }

    // ── one Messages API call (small; returns text or a friendly error) ──
    private async Task<(string? text, string? fail)> CompleteAsync(
        string systemPrompt, object[] userContent, CancellationToken ct)
    {
        var body = new
        {
            model = _model,
            max_tokens = MaxTokens,
            system = systemPrompt,
            messages = new object[] { new { role = "user", content = userContent } },
        };

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
                _log.LogWarning("Anthropic race-info failed: {Status} {Body}", (int)res.StatusCode, Truncate(raw, 400));
                return (null, FriendlyError((int)res.StatusCode));
            }

            var rawJson = await res.Content.ReadAsStringAsync(ct);
            var resp = JsonSerializer.Deserialize<AnthropicResponse>(rawJson, Json);
            var text = resp?.Text();
            return string.IsNullOrWhiteSpace(text)
                ? (null, "The AI returned an empty response. Try again.")
                : (text, null);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (OperationCanceledException)
        {
            return (null, "The AI took too long. Try again.");
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Anthropic race-info request errored");
            return (null, "Couldn't reach the AI service. Try again.");
        }
    }

    private const string SystemPrompt = """
        You extract the key facts about ONE endurance race/event from the text of its web page.
        Return a single JSON object and NOTHING else — no prose, no markdown fences:
        { "name": string, "date": "yyyy-MM-dd" | "", "location": string }

        Rules:
        - name: the event's name as an athlete would say it (e.g. "Tiberias 70.3", "Berlin Marathon").
          Keep it short; drop marketing taglines and the year unless the year is part of the name.
        - date: the race day in ISO yyyy-MM-dd. If only a month/year or a date range is given, use the
          first race day. If no date is on the page, use "".
        - location: city / venue / region as stated (e.g. "Sea of Galilee", "Kona, Hawaii"). "" if unknown.
        - If the page is clearly NOT a race/event page, set name to "".
        """;

    private static string UserPrompt(string url, string today, string pageText) => $"""
        Today is {today}. Extract the race details from this event page.
        URL: {url}

        PAGE TEXT:
        {pageText}

        Return only the JSON object now.
        """;

    // ── helpers ──
    private static bool TryNormalizeUrl(string? raw, out Uri uri)
    {
        uri = null!;
        var s = (raw ?? "").Trim();
        if (s.Length == 0) return false;
        if (!s.Contains("://")) s = "https://" + s;
        if (!Uri.TryCreate(s, UriKind.Absolute, out var u)) return false;
        if (u.Scheme != Uri.UriSchemeHttp && u.Scheme != Uri.UriSchemeHttps) return false;
        uri = u;
        return true;
    }

    private static string? NormalizeDate(string? raw)
    {
        var s = (raw ?? "").Trim();
        if (s.Length == 0) return null;
        return DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
            ? d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            : null;
    }

    private static string? Clean(string? v, int max)
    {
        var s = (v ?? "").Trim();
        if (s.Length == 0) return null;
        return s.Length > max ? s[..max] : s;
    }

    private static string Str(JsonElement obj, string prop) =>
        obj.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String ? (v.GetString() ?? "") : "";

    private static bool TryExtractJson(string text, out string json)
    {
        json = "";
        int start = text.IndexOf('{');
        int end = text.LastIndexOf('}');
        if (start < 0 || end <= start) return false;
        json = text[start..(end + 1)];
        return true;
    }

    private static string FriendlyError(int status) => status switch
    {
        401 or 403 => "The server's AI credentials were rejected. Check the Anthropic API key.",
        429 => "The AI service is rate-limited right now. Try again shortly.",
        >= 500 => "The AI service is temporarily unavailable. Try again.",
        _ => "The AI couldn't read that event page.",
    };

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max];

    private sealed class AnthropicResponse
    {
        [JsonPropertyName("content")] public List<ContentBlock>? Content { get; set; }

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
