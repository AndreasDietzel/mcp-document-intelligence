#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { execSync } from "child_process";

// AppleScript Hilfsfunktion
function runAppleScript(script: string): string {
  try {
    const result = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
      encoding: "utf-8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim();
  } catch (error: any) {
    console.error("AppleScript Error:", error.message);
    return "";
  }
}

// Datums-Hilfsfunktionen
function getDateRange(timeframe: string): { startDate: Date; endDate: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (timeframe.toLowerCase()) {
    case "today":
    case "heute":
      return {
        startDate: today,
        endDate: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      };

    case "weekend":
    case "wochenende": {
      const dayOfWeek = now.getDay();
      const daysUntilSaturday = dayOfWeek === 0 ? 6 : 6 - dayOfWeek;
      const saturday = new Date(today.getTime() + daysUntilSaturday * 24 * 60 * 60 * 1000);
      const monday = new Date(saturday.getTime() + 3 * 24 * 60 * 60 * 1000);
      return { startDate: saturday, endDate: monday };
    }

    case "week":
    case "woche":
    case "next week":
    case "nächste woche": {
      const monday = new Date(today);
      monday.setDate(today.getDate() + ((1 + 7 - today.getDay()) % 7 || 7));
      const sunday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000);
      return { startDate: monday, endDate: sunday };
    }

    default:
      return {
        startDate: today,
        endDate: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      };
  }
}

// FIX 1: Wetter mit Open-Meteo (kostenlos, zuverlässig)
async function getWeather(): Promise<string> {
  try {
    // Open-Meteo API für Dresden (51.05°N, 13.74°E) - keine API-Keys erforderlich!
    const response = execSync(
      'curl -s "https://api.open-meteo.com/v1/forecast?latitude=51.05&longitude=13.74&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code&temperature_unit=celsius&timezone=auto"',
      { encoding: "utf-8", timeout: 8000 }
    );
    
    const data = JSON.parse(response);
    const current = data.current;
    
    if (!current) {
      return "Wetter: Daten nicht verfügbar";
    }
    
    const weatherDescriptions: { [key: number]: string } = {
      0: "Klarer Himmel",
      1: "Heiter",
      2: "Teilweise bewölkt",
      3: "Bewölkt",
      45: "Nebel",
      51: "Leichter Regen",
      61: "Regen",
      71: "Schnee",
      80: "Regenschauer",
      95: "Gewitter"
    };
    
    const weatherCode = current.weather_code || 0;
    const description = weatherDescriptions[weatherCode] || "Unbekannt";
    
    return `Dresden: ${current.temperature_2m}°C, ${description}, Luftfeuchte: ${current.relative_humidity_2m}%`;
  } catch (error) {
    return "Wetter: Daten aktuell nicht verfügbar";
  }
}

// FIX 2: Kalender - Mehrere Kalender durchsuchen, alle Events für heute
async function getCalendarEvents(startDate: Date, endDate: Date): Promise<string> {
  const script = `
    set output to ""
    set todayStart to current date
    set time of todayStart to 0
    set todayEnd to todayStart + (1 * days)
    
    tell application "Calendar"
      try
        -- Durchsuche ALLE Kalender
        set allEvents to {}
        repeat with cal in calendars
          try
            set calEvents to (every event of cal)
            repeat with evt in calEvents
              set end of allEvents to evt
            end repeat
          end try
        end repeat
        
        -- Filtere Events für heute
        repeat with evt in allEvents
          try
            set evtStart to start date of evt
            if evtStart >= todayStart and evtStart < todayEnd then
              set evtName to summary of evt
              set evtTime to time string of evtStart
              set output to output & "🗓️ " & evtName & " (" & evtTime & ")" & linefeed
            end if
          end try
        end repeat
      end try
    end tell
    
    if output is "" then
      return "📅 Keine Termine für heute"
    else
      return "📅 Termine für heute:" & linefeed & output
    end if
  `;
  return runAppleScript(script);
}

// FIX 3: Erinnerungen - Nur ERSTE Liste, optimiert
async function getReminders(): Promise<string> {
  const script = `
    set output to ""
    set todayStart to current date
    set time of todayStart to 0
    set todayEnd to todayStart + (1 * days)
    
    tell application "Reminders"
      try
        set firstList to list 1
        set allReminders to (every reminder of firstList whose completed is false)
        
        repeat with rem in allReminders
          try
            set remDue to due date of rem
            if remDue is not missing value then
              if remDue >= todayStart and remDue < todayEnd then
                set output to output & "• " & (name of rem) & linefeed
              end if
            end if
          end try
        end repeat
        
        if output is "" then
          return "Keine heute fälligen Erinnerungen"
        else
          return output
        end if
      on error
        return "Keine Erinnerungen verfügbar"
      end try
    end tell
  `;
  return runAppleScript(script);
}

// FIX 4: Mail - Alle Mails in der Inbox erfassen
async function getUnreadMail(): Promise<string> {
  const script = `
    tell application "Mail"
      set allMailsOutput to ""
      
      try
        -- Hole ALLE Mails aus der Inbox
        set allMessages to (every message of inbox)
        set totalCount to count of allMessages
        
        if totalCount > 0 then
          allMailsOutput to "📧 INBOX (" & totalCount & " Mails):" & linefeed & linefeed
          
          -- Zeige bis zu 20 Mails
          set maxDisplay to 20
          if totalCount < maxDisplay then set maxDisplay to totalCount
          
          repeat with i from 1 to maxDisplay
            set msg to item i of allMessages
            set msgSubject to subject of msg
            set msgSender to sender of msg
            set msgRead to read status of msg
            set msgDate to date received of msg
            set dateStr to date string of msgDate & " " & time string of msgDate
            
            set readStatus to "✅"
            if not msgRead then set readStatus to "❌ UNGELESEN"
            
            set allMailsOutput to allMailsOutput & readStatus & " | " & msgSubject & " (von " & msgSender & ") | " & dateStr & linefeed
          end repeat
          
          if totalCount > maxDisplay then
            set allMailsOutput to allMailsOutput & linefeed & "... und " & (totalCount - maxDisplay) & " weitere Mails"
          end if
        else
          set allMailsOutput to "📭 Inbox ist leer"
        end if
        
        return allMailsOutput
      on error errMsg
        return "❌ Fehler beim Mailzugriff: " & errMsg
      end try
    end tell
  `;
  return runAppleScript(script);
}

async function getNews(): Promise<string> {
  try {
    // Versuche zuerst Perplexity News API
    const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
    
    if (perplexityApiKey) {
      try {
        const response = execSync(
          `curl -s -X POST "https://api.perplexity.ai/chat/completions" \\
            -H "Authorization: Bearer ${perplexityApiKey}" \\
            -H "Content-Type: application/json" \\
            -d '{"model":"pplx-7b-online","messages":[{"role":"user","content":"Gib mir die 5 wichtigsten Nachrichten von heute in Deutschland. Antworte nur mit einer nummerierten Liste ohne weitere Erklärungen."}]}'`,
          { encoding: "utf-8", timeout: 10000 }
        );
        
        const data = JSON.parse(response);
        if (data.choices && data.choices[0] && data.choices[0].message) {
          const newsText = data.choices[0].message.content;
          return "📰 TOP 5 Nachrichten von heute:" + (newsText ? "\n" + newsText : "\nNicht verfügbar");
        }
      } catch (perplexityError) {
        console.log("Perplexity API nicht verfügbar, fallback zu Tagesschau RSS");
      }
    }
    
    // Fallback: Tagesschau RSS
    const result = execSync(
      `curl -s "https://www.tagesschau.de/xml/rss2/" | grep -o "<title>[^<]*</title>" | sed 's/<title>//;s|</title>||' | head -6 | tail -5`,
      { encoding: "utf-8", timeout: 5000 }
    );
    
    const newsItems = result.trim().split("\n").filter(line => line.length > 0);
    if (newsItems.length > 0) {
      return "📰 Nachrichten von Tagesschau:\n" + newsItems.map((item, i) => `${i + 1}. ${item}`).join("\n");
    }
    
    return "📰 Keine News verfügbar";
  } catch (error) {
    return "📰 News nicht verfügbar";
  }
}

async function getBriefing(timeframe: string = "heute"): Promise<string> {
  const { startDate, endDate } = getDateRange(timeframe);

  const [weather, calendar, reminders, mail, news] = await Promise.all([
    getWeather(),
    getCalendarEvents(startDate, endDate),
    getReminders(),
    getUnreadMail(),
    getNews(),
  ]);

  return `
🌤️  WETTER
${weather}

📅 TERMINE (${timeframe})
${calendar}

✅ ERINNERUNGEN
${reminders}

📧 MAIL
${mail}

📰 NEWS
${news}
  `.trim();
}

const server = new Server(
  {
    name: "perplexity-mcp-briefing",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_briefing",
        description: "Erstellt ein Briefing mit Wetter, Terminen, Erinnerungen, Mails und News",
        inputSchema: {
          type: "object",
          properties: {
            timeframe: {
              type: "string",
              description: "Zeitraum: 'heute', 'wochenende', 'woche'",
              default: "heute",
            },
          },
        },
      },
      {
        name: "get_weather",
        description: "Zeigt das aktuelle Wetter",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_calendar_events",
        description: "Zeigt Termine für einen Zeitraum",
        inputSchema: {
          type: "object",
          properties: {
            timeframe: {
              type: "string",
              description: "Zeitraum: 'heute', 'wochenende', 'woche'",
              default: "heute",
            },
          },
        },
      },
      {
        name: "get_reminders",
        description: "Zeigt heute fällige Erinnerungen",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_unread_mail",
        description: "Zeigt ungelesene, markierte und letzte Mails",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_news",
        description: "Zeigt aktuelle Nachrichten von Tagesschau",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "get_briefing": {
        const timeframe = (args?.timeframe as string) || "heute";
        const briefing = await getBriefing(timeframe);
        return {
          content: [{ type: "text", text: briefing }],
        };
      }

      case "get_weather": {
        const weather = await getWeather();
        return {
          content: [{ type: "text", text: weather }],
        };
      }

      case "get_calendar_events": {
        const timeframe = (args?.timeframe as string) || "heute";
        const { startDate, endDate } = getDateRange(timeframe);
        const events = await getCalendarEvents(startDate, endDate);
        return {
          content: [{ type: "text", text: events }],
        };
      }

      case "get_reminders": {
        const reminders = await getReminders();
        return {
          content: [{ type: "text", text: reminders }],
        };
      }

      case "get_unread_mail": {
        const mail = await getUnreadMail();
        return {
          content: [{ type: "text", text: mail }],
        };
      }

      case "get_news": {
        const news = await getNews();
        return {
          content: [{ type: "text", text: news }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Perplexity MCP Briefing Server läuft");
}

main().catch(console.error);
