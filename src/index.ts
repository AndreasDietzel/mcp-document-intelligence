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

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

// Tool-Implementierungen
async function getCalendarEvents(startDate: Date, endDate: Date): Promise<string> {
  const script = `
    set startDate to date "${startDate.toDateString()}"
    set endDate to date "${endDate.toDateString()}"
    set output to ""
    
    tell application "Calendar"
      -- Nur die ersten 3 Kalender für bessere Performance
      set allCalendars to every calendar
      set calendarCount to count of allCalendars
      set maxCalendars to 3
      if calendarCount < maxCalendars then set maxCalendars to calendarCount
      
      repeat with i from 1 to maxCalendars
        set cal to item i of allCalendars
        set events to (every event of cal whose start date ≥ startDate and start date < endDate)
        repeat with evt in events
          set eventName to summary of evt
          set eventStart to start date of evt
          set eventLocation to location of evt
          set output to output & eventName & " | " & (eventStart as string) & " | " & eventLocation & linefeed
        end repeat
      end repeat
    end tell
    return output
  `;

  return runAppleScript(script);
}

async function getReminders(): Promise<string> {
  const today = new Date();
  const todayStr = today.toDateString();
  
  const script = `
    set output to ""
    set todayDate to date "${todayStr}"
    set tomorrowDate to todayDate + (1 * days)
    
    tell application "Reminders"
      try
        -- Nur die erste Liste abfragen
        set allLists to every list
        if (count of allLists) = 0 then
          return "Keine Reminders-Listen gefunden"
        end if
        
        set firstList to item 1 of allLists
        set listName to name of firstList
        
        -- Nur offene Erinnerungen die heute fällig sind
        set todayReminders to (every reminder of firstList whose completed is false and due date is not missing value and due date ≥ todayDate and due date < tomorrowDate)
        
        if (count of todayReminders) = 0 then
          return "Keine heute fälligen Erinnerungen"
        end if
        
        set output to "Heute fällig (" & listName & "):" & return & return
        
        repeat with rem in todayReminders
          try
            set remName to name of rem
            set remDueDate to due date of rem
            set output to output & "• " & remName & " | " & (remDueDate as string) & return
          end try
        end repeat
      on error errMsg
        return "Fehler: " & errMsg
      end try
    end tell
    
    return output
  `;

  return runAppleScript(script);
}

async function getUnreadMail(): Promise<string> {
  const script = `
    set output to ""
    tell application "Mail"
      -- Explizit nur Inbox, max 5 Mails
      set inboxAccount to account 1
      set inboxMailbox to mailbox "INBOX" of inboxAccount
      set unreadMessages to (every message of inboxMailbox whose read status is false)
      set msgCount to count of unreadMessages
      
      if msgCount = 0 then
        return "Keine ungelesenen E-Mails"
      end if
      
      repeat with msg in (items 1 thru (minimum of {msgCount, 5}) of unreadMessages)
        set msgSubject to subject of msg
        set msgSender to sender of msg
        set msgDate to date received of msg
        set output to output & msgSubject & " | Von: " & msgSender & " | " & (msgDate as string) & linefeed
      end repeat
    end tell
    return output
  `;

  return runAppleScript(script);
}

async function getWeather(): Promise<string> {
  const script = `
    tell application "Weather"
      try
        set currentCity to name of current city
        set currentTemp to current temperature
        set currentCondition to condition of current city
        set todayHigh to high temperature of item 1 of forecast
        set todayLow to low temperature of item 1 of forecast
        return currentCity & " | " & currentTemp & "°C | " & currentCondition & " | H: " & todayHigh & "°C L: " & todayLow & "°C"
      on error
        return "Wetter-App nicht verfügbar"
      end try
    end tell
  `;
  
  return runAppleScript(script);
}

async function getNews(source: string = "tagesschau"): Promise<string> {
  // Tagesschau RSS Feed abrufen
  const tagesschauUrl = "https://www.tagesschau.de/xml/rss2/";
  
  try {
    const curlCommand = `curl -s "${tagesschauUrl}" | grep -E "<title>|<description>" | head -n 10 | sed 's/<[^>]*>//g' | sed 's/&amp;/\\&/g'`;
    const result = execSync(curlCommand, { encoding: "utf-8" });
    
    const lines = result.split("\n").filter(l => l.trim());
    let output = "";
    
    for (let i = 0; i < Math.min(lines.length, 6); i += 2) {
      const title = lines[i]?.trim();
      const desc = lines[i + 1]?.trim();
      if (title && title !== "tagesschau.de - die erste Adresse für Nachrichten und umfassende Berichte") {
        output += `• ${title}\n`;
      }
    }
    
    return output || "Keine aktuellen Nachrichten verfügbar";
  } catch (error) {
    return "Nachrichten konnten nicht abgerufen werden";
  }
}

async function getBriefing(timeframe: string): Promise<string> {
  const { startDate, endDate } = getDateRange(timeframe);
  let briefing = `📋 BRIEFING FÜR ${timeframe.toUpperCase()} (${formatDate(startDate)} - ${formatDate(endDate)})\n\n`;

  // Wetter
  briefing += "🌤️ WETTER:\n";
  const weather = await getWeather();
  briefing += weather + "\n\n";

  // Kalender (nur 3 Hauptkalender)
  briefing += "📅 KALENDER:\n";
  const events = await getCalendarEvents(startDate, endDate);
  briefing += events || "Keine Termine\n";
  briefing += "\n";

  // Erinnerungen (nur heute fällig)
  briefing += "✅ HEUTE FÄLLIG:\n";
  const reminders = await getReminders();
  briefing += reminders || "Keine heute fälligen Erinnerungen\n";
  briefing += "\n";

  // E-Mails (nur Inbox, max 5)
  briefing += "📧 UNGELESENE E-MAILS:\n";
  const mail = await getUnreadMail();
  briefing += mail || "Keine ungelesenen E-Mails\n";
  briefing += "\n";

  // News
  briefing += "📰 NACHRICHTEN (Tagesschau):\n";
  const news = await getNews();
  briefing += news + "\n";

  return briefing;
}

// MCP Server Setup
const server = new Server(
  {
    name: "briefing-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool Definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_briefing",
        description:
          "Erstellt ein umfassendes Briefing mit Wetter, Kalender, Erinnerungen, E-Mails und Nachrichten. Optimiert für schnelle Performance.",
        inputSchema: {
          type: "object",
          properties: {
            timeframe: {
              type: "string",
              description: "Zeitraum für das Briefing: 'heute', 'wochenende', 'woche'",
              default: "heute",
            },
          },
        },
      },
      {
        name: "get_calendar_events",
        description: "Listet Kalendereinträge für einen Zeitraum (nur 3 Hauptkalender für Performance)",
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
        description: "Zeigt heute fällige offene Erinnerungen",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_unread_mail",
        description: "Zeigt die letzten 5 ungelesenen E-Mails aus der Inbox",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_weather",
        description: "Zeigt aktuelles Wetter von der macOS Wetter-App",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_news",
        description: "Zeigt aktuelle Nachrichten von der Tagesschau (oder anderer Quelle)",
        inputSchema: {
          type: "object",
          properties: {
            source: {
              type: "string",
              description: "Nachrichtenquelle (default: 'tagesschau')",
              default: "tagesschau",
            },
          },
        },
      },
    ],
  };
});

// Tool Execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "get_briefing": {
        const timeframe = (args?.timeframe as string) || "heute";
        const result = await getBriefing(timeframe);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "get_calendar_events": {
        const timeframe = (args?.timeframe as string) || "heute";
        const { startDate, endDate } = getDateRange(timeframe);
        const result = await getCalendarEvents(startDate, endDate);
        return {
          content: [{ type: "text", text: result || "Keine Kalendereinträge gefunden" }],
        };
      }

      case "get_reminders": {
        const result = await getReminders();
        return {
          content: [{ type: "text", text: result || "Keine offenen Erinnerungen" }],
        };
      }

      case "get_unread_mail": {
        const result = await getUnreadMail();
        return {
          content: [{ type: "text", text: result || "Keine ungelesenen E-Mails" }],
        };
      }

      case "get_weather": {
        const result = await getWeather();
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "get_news": {
        const source = (args?.source as string) || "tagesschau";
        const result = await getNews(source);
        return {
          content: [{ type: "text", text: result }],
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

// Server starten
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Briefing MCP Server läuft");
}

main().catch((error) => {
  console.error("Server Error:", error);
  process.exit(1);
});
