import Avatar from './Avatar.jsx';
import { useAuthedImage } from '../lib/authedImage.js';

// Avatar for a *teammate* whose photo lives behind the authenticated image proxy.
// Resolves `avatarUrl` (e.g. /api/images/avatars/{id}, or null when they have no
// photo) to a renderable object URL and falls back to initials until then / on 404.
// Drop-in for <Avatar>: forwards initials/color/size/radius/fontSize/style.
export default function AuthedAvatar({ avatarUrl, token, ...rest }) {
  const photo = useAuthedImage(avatarUrl || null, token || null);
  return <Avatar photo={photo} {...rest} />;
}
