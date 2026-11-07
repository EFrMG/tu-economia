# Economic news RSS sources

The dashboard news preview and `/noticias` use three Argentine economy desks, declared in `app/lib/economic-news.ts`. Each publisher lists its feed in an RSS directory, where to confirm or replace a URL that changes.

| Source | Economy feed | Why include it |
| --- | --- | --- |
| iProfesional | [Economía](https://www.iprofesional.com/rss/economia) | A business and economics publication. [RSS directory](https://www.iprofesional.com/rss) |
| Clarín | [Economía](https://www.clarin.com/rss/economia/) | General-interest outlet with broader coverage of policy and household impacts. [RSS directory](https://www.clarin.com/rss.html) |
| Página/12 | [Economía](https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/economia/notas) | Economy desk with a different editorial perspective. [RSS directory](https://www.pagina12.com.ar/rss/) |

Each story shows a headline, a summary when the feed supplies one (at most 200 characters), the source, the publication time and a link to the article. The article body is never fetched.

`app/lib/economic-news.server.ts` caches each source for five minutes, limits requests to four seconds and 2 MiB so a slow feed does not hold up the dashboard's quotations, and reports unavailable sources alongside the stories that loaded. Normalization rejects malformed items and is tested against RSS and Atom fixtures.
