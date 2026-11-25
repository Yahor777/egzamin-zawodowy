// What an IIS site shows in Edge: the page itself (in a sandboxed frame), a directory listing or
// the IIS error page (detailed for a request from the server itself, short for a remote client).
import type { HttpOutcome, IisErr } from '../domain'

export const titleOf = (o: HttpOutcome, fallback: string): string => {
  if (o.kind === 'page') return /<title[^>]*>([^<]*)<\/title>/i.exec(o.html)?.[1]?.trim() || o.url.replace(/^https?:\/\//, '')
  if (o.kind === 'dir') return `${o.url.replace(/^https?:\/\//, '').split('/')[0]} - ${o.path}`
  if (o.kind === 'error') return `IIS ${o.err.status} - ${o.err.title}`
  if (o.kind === 'badhost') return 'Bad Request'
  return fallback
}

export function SitePage({ o, local, host }: { o: HttpOutcome; local: boolean; host: string }) {
  if (o.kind === 'page')
    return o.plain ? (
      <pre className="site-plain">{o.html}</pre>
    ) : (
      <iframe className="site-frame" title={o.site} sandbox="" srcDoc={o.html} />
    )
  if (o.kind === 'dir')
    return (
      <div className="site-dir">
        <h1>
          {host} - {o.path}
        </h1>
        <hr />
        <pre>
          {o.path !== '/' && (
            <>
              [<a>Katalog nadrzędny</a>]
              {'\n\n'}
            </>
          )}
          {o.entries.map((e) => (
            <span key={e.name}>
              {e.dir ? '         <dir> ' : `${String(e.size).padStart(14)} `}
              <a>{e.name}</a>
              {'\n'}
            </span>
          ))}
        </pre>
        <hr />
      </div>
    )
  if (o.kind === 'badhost')
    return (
      <div className="site-iis">
        <h2>Bad Request - Invalid Hostname</h2>
        <hr />
        <p>HTTP Error 400. Nazwa hosta w żądaniu jest nieprawidłowa.</p>
        <p className="site-note">Żadna witryna nie ma powiązania z nazwą „{host}” na tym porcie. Dodaj nazwę hosta w powiązaniu witryny (inetmgr → Powiązania) albo wejdź przez nazwę zgodną z powiązaniem.</p>
      </div>
    )
  if (o.kind === 'error') return <IisError e={o.err} local={local} host={host} />
  return null
}

function IisError({ e, local, host }: { e: IisErr; local: boolean; host: string }) {
  const code = `${e.status}.${e.sub}`
  if (!local)
    return (
      <div className="site-iis remote">
        <h2>Błąd serwera</h2>
        <hr />
        <h3>
          {e.status} - {e.status === 404 ? 'Nie znaleziono pliku lub katalogu.' : e.status === 403 ? 'Zabroniony: odmowa dostępu.' : e.status === 503 ? 'Usługa jest niedostępna.' : 'Brak autoryzacji.'}
        </h3>
        <p>{e.remote}</p>
      </div>
    )
  return (
    <div className="site-iis detailed">
      <h1>Błąd serwera w aplikacji „{e.site}”.</h1>
      <h2>Internet Information Services 10.0</h2>
      <h3>Podsumowanie błędu</h3>
      <h2>
        HTTP Error {code} - {e.title}
      </h2>
      <p>{e.remote}</p>
      <h3>Najbardziej prawdopodobne przyczyny:</h3>
      <ul>
        {e.causes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <h3>Co można zrobić:</h3>
      <ul>
        {e.tries.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <h3>Szczegółowe informacje o błędzie:</h3>
      <table>
        <tbody>
          <tr>
            <th>Moduł</th>
            <td>{e.module}</td>
          </tr>
          <tr>
            <th>Powiadomienie</th>
            <td>MapRequestHandler</td>
          </tr>
          <tr>
            <th>Procedura obsługi</th>
            <td>{e.handler}</td>
          </tr>
          <tr>
            <th>Kod błędu</th>
            <td>{e.code}</td>
          </tr>
          <tr>
            <th>Żądany adres URL</th>
            <td>http://{host}</td>
          </tr>
          {e.physical && (
            <tr>
              <th>Ścieżka fizyczna</th>
              <td>{e.physical}</td>
            </tr>
          )}
          <tr>
            <th>Metoda logowania</th>
            <td>Anonimowe</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
