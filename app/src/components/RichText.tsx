// Renders exam text with technical tokens (IPs, paths, commands) in monospace.
const TOKEN =
  /(\b\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?\b|(?:[A-Fa-f0-9]{1,4}:){2,7}[A-Fa-f0-9:]*(?:\/\d{1,3})?|\\\\[\w$.\\%-]+|(?:^|(?<=\s))\/(?:etc|dev|home|var|usr|bin|mnt|tmp|root|proc|boot|sbin|opt)[\w./-]*|\b[A-Z]:\\[\w\\. -]*|\b\w+\.(?:msc|exe|cpl|sys|conf|cfg|sh|bat|ps1)\b|%\w+%)/g

export function RichText({ text }: { text: string }) {
  const parts = text.split(TOKEN)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <code key={i} className="tok">
            {p}
          </code>
        ) : (
          p
        ),
      )}
    </>
  )
}
