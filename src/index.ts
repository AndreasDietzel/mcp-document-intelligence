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

// FIX 1: Wetter mit curl und längerem Timeout
async function getWeather(): Promise<string> {
  try {
    // Versuche wttr.in mit curl (10s timeout)
    const result = execSync(
      'curl -s --max-time 10 "https://wttr.in/?format=%l:+%C+%t" 2>/dev/null || echo ""',
      { encoding: "utf-8", timeout: 12000 }
    );
    const weather = result.trim();
    if (weather && !weather.includes('not found')) {
      return weather;
    }
    
    // Fallback: Einfache Meldung
    return "Wetter: Daten aktuell nicht verfügbar";
  } catch (error) {
    return "Wetter: Daten aktuell nicht verfügbar";
  }
}

// FIX 2: Kalender - Optimiert, nur ERSTE Kalender, nur HEUTE
async function getCalendarEvents(startDate: Date, endDate: Date): Promise<string> {
  const script = `
    set output to ""
    set todayStart to current date
    set time of todayStart to 0
    set todayEnd to todayStart + (1 * days)
    
    tell application "Calendar"
      try
        -- Nur ERSTEN Kalender verwenden für Geschwindigkeit
        set cal to calendar 1
        set allEvents to (every event of cal)
        
        repeat with evt in allEvents
          try
            set evtStart to start date of evt
            if evtStart >= todayStart and evtStart < todayEnd then
              set evtName to summary of evt
              set output to output & evtName & linefeed
            end if
          end try
        end repeat
      end try
    end tell
    
    if output is "" then
      return "Keine Termine heute"
    else
      return output
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

// FIX 4: Mail mit korrigierter Syntax
async function getUnreadMail(): Promise<string> {
  const script = `
    tell application "Mail"
      set unreadMessages to {}
      set flaggedMessages to {}
      set recentMessages to {}
      
      -- Ungelesene Mails
      set allUnread to (every message of inbox whose read status is false)
      set unreadCount to count of allUnread
      if unreadCount > 0 then
        set maxUnread to 3
        if unreadCount < maxUnread then set maxUnread to unreadCount
        repeat with i from 1 to maxUnread
          set msg to item i of allUnread
          set end of unreadMessages to {subject:subject of msg, sender:sender of msg, dateReceived:date received of msg, isRead:false}
        end repeat
      end if
      
      -- Markierte Mails
      set allFlagged to (every message of inbox whose flagged status is true)
      set flaggedCount to count of allFlagged
      if flaggedCount > 0 then
        set maxFlagged to 3
        if flaggedCount < maxFlagged then set maxFlagged to flaggedCount
        repeat with i from 1 to maxFlagged
          set msg to item i of allFlagged
          set end of flaggedMessages to {subject:subject of msg, sender:sender of msg, dateReceived:date received of msg, isRead:(read status of msg)}
        end repeat
      end if
      
      -- Letzte 3 Mails
      set allMessages to (every message of inbox)
      set totalCount to count of allMessages
      if totalCount > 0 then
        set maxRecent to 3
        if totalCount < maxRecent then set maxRecent to totalCount
        repeat with i from 1 to maxRecent
          set msg to item i of allMessages
          set end of recentMessages to {subject:subject of msg, sender:sender of msg, dateReceived:date received of msg, isRead:(read status of msg)}
        end repeat
      end if
      
      -- Formatiere Ausgabe
      set output to ""
      
      if (count of unreadMessages) > 0 then
        set output to output & "📧 UNGELESEN (" & unreadCount & "):" & linefeed
        repeat with msg in unreadMessages
          set output to output & "  • " & subject of msg & " (von " & sender of msg & ")" & linefeed
        end repeat
        set output to output & linefeed
      end if
      
      if (count of flaggedMessages) > 0 then
        set output to output & "⭐ MARKIERT (" & flaggedCount & "):" & linefeed
        repeat with msg in flaggedMessages
          set readStatus to ""
          if not (isRead of msg) then set readStatus to " [UNGELESEN]"
          set output to output & "  • " & subject of msg & " (von " & sender of msg & ")" & readStatus & linefeed
        end repeat
        set output to output & linefeed
      end if
      
      if (count of recentMessages) > 0 then
        set output to output & "📬 LETZTE MAILS:" & linefeed
        repeat with msg in recentMessages
          set readStatus to ""
          if not (isRead of msg) then set readStatus to " [UNGELESEN]"
          set output to output & "  • " & subject of msg & " (von " & sender of msg & ")" & readStatus & linefeed
        end repeat
      end if
      
      if output is "" then
        return "Keine Mails in der Inbox"
      else
        return output
      end if
    end tell
  `;
  return runAppleScript(script);
}

async function getNews(): Promise<string> {
  try {
    const result = execSync(
      `curl -s "https://www.tagesschau.de/xml/rss2/" | grep -o "<title>[^<]*</title>" | sed 's/<title>//;s|</title>||' | head -6 | tail -5`,
      { encoding: "utf-8", timeout: 5000 }
    );
    return result.trim() || "Keine News verfügbar";
  } catch (error) {
    return "News nicht verfügbar";
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
