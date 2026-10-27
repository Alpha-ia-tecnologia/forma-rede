// Reconhece o endereco de um recurso da trilha para decidir como mostra-lo.
// So vira player (iframe) o que e de um provedor conhecido, montado aqui a partir
// do id: nunca se embute um endereco qualquer. O resto abre em nova aba.

export type Midia =
  | { forma: 'embed'; provedor: 'YouTube' | 'Vimeo' | 'Spotify'; src: string; proporcao: 'video' | 'audio' | 'audio-alto' }
  | { forma: 'video'; src: string }
  | { forma: 'audio'; src: string }
  | { forma: 'link'; href: string; host: string };

const ID = /^[A-Za-z0-9_-]+$/;

export function reconhecerMidia(endereco: string | null | undefined): Midia | null {
  if (!endereco) return null;
  let u: URL;
  try { u = new URL(endereco); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.replace(/^(www|m)\./, '');
  const partes = u.pathname.split('/').filter(Boolean);

  if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
    const id = host === 'youtu.be' ? partes[0]
      : u.searchParams.get('v') ?? (['embed', 'shorts', 'live'].includes(partes[0] ?? '') ? partes[1] : undefined);
    if (id && ID.test(id)) return { forma: 'embed', provedor: 'YouTube', src: `https://www.youtube-nocookie.com/embed/${id}`, proporcao: 'video' };
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = partes.find((p) => /^\d+$/.test(p));
    if (id) return { forma: 'embed', provedor: 'Vimeo', src: `https://player.vimeo.com/video/${id}`, proporcao: 'video' };
  }
  if (host === 'open.spotify.com') {
    // Aceita /episode/ID, /show/ID e os mesmos com prefixo de idioma (/intl-pt/episode/ID).
    const i = partes.findIndex((p) => p === 'episode' || p === 'show');
    const tipo = partes[i];
    const id = partes[i + 1];
    if (i >= 0 && id && ID.test(id)) {
      return { forma: 'embed', provedor: 'Spotify', src: `https://open.spotify.com/embed/${tipo}/${id}`, proporcao: tipo === 'show' ? 'audio-alto' : 'audio' };
    }
  }
  if (/\.(mp4|webm)$/i.test(u.pathname)) return { forma: 'video', src: u.href };
  if (/\.(mp3|m4a|ogg|oga|wav)$/i.test(u.pathname)) return { forma: 'audio', src: u.href };
  return { forma: 'link', href: u.href, host };
}

/** Texto curto para o retorno do formulario ("Vídeo do YouTube reconhecido"). */
export function descreverMidia(m: Midia | null): string | null {
  if (!m) return null;
  if (m.forma === 'embed') return `${m.provedor}: o player abre aqui na trilha.`;
  if (m.forma === 'video') return 'Arquivo de vídeo: toca aqui na trilha.';
  if (m.forma === 'audio') return 'Arquivo de áudio: toca aqui na trilha.';
  return `Link para ${m.host}: abre em nova aba.`;
}
