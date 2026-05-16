export const config = { maxDuration: 60 };

const SYSTEM = `Du bist ein präziser Immobilienmarkt-Analyst für deutsche Kapitalanlage-Immobilien.
Recherchiere mit Web-Suchen aktuelle, belegbare Daten für den genannten Standort.
Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt – kein Markdown, kein Text außerhalb des JSON.`;

function buildPrompt(city, street) {
  return `Analysiere diesen Standort für eine Kapitalanlage-Immobilie mit aktuellen Daten aus Web-Suchen.

Standort: ${city}${street ? ', ' + street : ''}

Bewertungsskala 1–10 (10 = optimal für Kapitalanleger).

SCORING-HINWEISE:
- regulierung: 1 = strenge Regulierung (Mietpreisbremse + Milieuschutz + Umwandlungsverbot), 10 = keine Einschränkungen
- leerstand: 1 = hoher Leerstand (>5 %), 10 = sehr niedrig (<0,5 %)
- arbeitslosigkeit: 1 = sehr hohe Quote (>12 %), 10 = sehr niedrig (<3 %)

RECHERCHIERE für jedes Kriterium gezielt folgende Quellen:
1. mietpreisniveau (15 %): Mietspiegel ${city}, ImmobilienScout24, Immowelt
2. infrastruktur (13 %): RMV-Liniennetz, DB-Fahrplan, Pendleratlas Bundesagentur für Arbeit
3. arbeitgeber_uni (10 %): BA Statistik Regionen, hochschulkompass.de, IHK-Standortberichte
4. bevoelkerung (10 %): Hessische Gemeindestatistik, wegweiser-kommune.de, Destatis
5. stadtentwicklung (9 %): Stadtportal ${city}, bauleitplanung.hessen.de, Regionalverband FrankfurtRheinMain
6. leerstand (8 %): ergebnisse.zensus2022.de, empirica-regio.de
7. wirtschaftskraft (8 %): inkar.de, Hessische Gemeindestatistik, IHK Frankfurt
8. kaufkraft (7 %): GfK/NIQ Kaufkraftdaten 2024, wegweiser-kommune.de
9. regulierung (7 %): rv.hessenrecht.hessen.de, Wohnungsamt ${city}
10. arbeitslosigkeit (5 %): statistik.arbeitsagentur.de, inkar.de
11. bildung (4 %): wegweiser-kommune.de Bildungsbericht, Schulverzeichnis Hessen
12. nahversorgung (4 %): bbsr.bund.de Nahversorgungsindikatoren, OpenStreetMap

Antworte ausschließlich mit diesem JSON (alle score-Felder 1–10, Begründungen mit konkreten Zahlen, max. 2 Sätze):

{
  "standort": "${city}${street ? ', ' + street : ''}",
  "kriterien": {
    "mietpreisniveau":  { "score": 7, "begruendung": "Aktuelle Kaltmieten und Preisentwicklung.", "quelle": "ImmobilienScout24 2024", "richtwert": "12 €/m²" },
    "infrastruktur":    { "score": 7, "begruendung": "ÖPNV-Anbindung und Pendelzeit nach Frankfurt.", "quelle": "RMV / DB" },
    "arbeitgeber_uni":  { "score": 7, "begruendung": "Größte Arbeitgeber und Hochschulen im 30-km-Radius.", "quelle": "BA Statistik / Hochschulkompass" },
    "bevoelkerung":     { "score": 7, "begruendung": "Einwohnerentwicklung der letzten 5 Jahre mit Zahlen.", "quelle": "Wegweiser Kommune" },
    "stadtentwicklung": { "score": 7, "begruendung": "Konkrete Entwicklungsprojekte und Bebauungspläne.", "quelle": "Stadtportal ${city}" },
    "leerstand":        { "score": 7, "begruendung": "Leerstandsquote in Prozent laut Zensus oder empirica.", "quelle": "Zensus 2022" },
    "wirtschaftskraft": { "score": 7, "begruendung": "BIP, Beschäftigung und Wirtschaftsstruktur.", "quelle": "INKAR/BBSR" },
    "kaufkraft":        { "score": 7, "begruendung": "Kaufkraftindex und Pro-Kopf-Wert in €.", "quelle": "GfK Kaufkraft 2024" },
    "regulierung":      { "score": 7, "begruendung": "Geltende Mietregulierungen und Schutzgebiete.", "quelle": "Hessenrecht / Wohnungsamt" },
    "arbeitslosigkeit": { "score": 7, "begruendung": "Aktuelle Arbeitslosenquote in % und Trend.", "quelle": "Bundesagentur für Arbeit" },
    "bildung":          { "score": 7, "begruendung": "Anzahl und Dichte von Kitas, Schulen, Hochschulen.", "quelle": "Schulverzeichnis Hessen" },
    "nahversorgung":    { "score": 7, "begruendung": "Erreichbarkeit Supermärkte, Ärzte und Apotheken.", "quelle": "BBSR / OpenStreetMap" }
  },
  "richtwert_kaltmiete_m2": 12,
  "fazit": "2–3 Sätze Gesamtfazit für Kapitalanleger."
}`;
}

function parseJSON(raw) {
  const attempts = [
    () => JSON.parse(raw),
    () => JSON.parse(raw.trim()),
    () => JSON.parse(raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()),
    () => { const m = raw.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); throw new Error('no match'); },
    () => { const s = raw.indexOf('{'), e = raw.lastIndexOf('}'); if (s > -1 && e > s) return JSON.parse(raw.slice(s, e + 1)); throw new Error('no braces'); }
  ];
  for (const fn of attempts) { try { return fn(); } catch (_) {} }
  throw new Error('JSON-Parsing fehlgeschlagen');
}

async function callClaude(messages) {
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: SYSTEM,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages
    })
  }).then(r => r.json());
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { city, street } = req.body || {};
  if (!city) return res.status(400).json({ error: 'Stadt fehlt' });

  let messages = [{ role: 'user', content: buildPrompt(city, street) }];
  let finalText = '';

  try {
    // Agentic loop: handles multi-step web search
    for (let i = 0; i < 12; i++) {
      const data = await callClaude(messages);

      if (data.error) {
        return res.status(500).json({ error: `Claude API: ${data.error.message}` });
      }

      const content = data.content || [];

      // Collect any text produced so far
      const texts = content.filter(b => b.type === 'text').map(b => b.text);
      if (texts.length > 0) finalText = texts.join('');

      // Done?
      if (data.stop_reason === 'end_turn') break;

      // Tool-use round: add assistant message and build tool_result blocks
      if (data.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content });

        const toolResults = content
          .filter(b => b.type === 'tool_use')
          .map(b => ({
            type: 'tool_result',
            tool_use_id: b.id,
            content: b.input?.query
              ? `Suchergebnisse für: ${b.input.query}`
              : 'Ergebnis erhalten.'
          }));

        if (toolResults.length > 0) {
          messages.push({ role: 'user', content: toolResults });
        } else {
          break; // safety exit
        }
      } else {
        break; // unknown stop reason
      }
    }

    if (!finalText) {
      return res.status(500).json({
        error: 'Keine Textantwort von Claude erhalten.',
        hint: 'Bitte prüfen Sie den API-Key und versuchen Sie es erneut.'
      });
    }

    const json = parseJSON(finalText);
    return res.status(200).json(json);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
