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
      set allCalendars to every calendar
      repeat with cal in allCalendars
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
  const script = `
    set output to ""
    tell application "Reminders"
      set allLists to every list
      repeat with lst in allLists
        set incompleteReminders to (every reminder of lst whose completed is false)
        repeat with rem in incompleteReminders
          set remName to name of rem
          set remDueDate to due date of rem
          if remDueDate is not missing value then
            set output to output & remName & " | Fällig: " & (remDueDate as string) & linefeed
          else
            set output to output & remName & " | Kein Fälligkeitsdatum" & linefeed
          end if
        end repeat
      end repeat
    end tell
    return output
  `;

  return runAppleScript(script);
}

async function getUnreadMail(): Promise<string> {
  const script = `
    set output to ""
    tell application "Mail"
      set unreadMessages to (every message of inbox whose read status is false)
      set msgCount to count of unreadMessages
      repeat with msg in (items 1 thru (minimum of {msgCount, 10}) of unreadMessages)
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

async function getBriefing(timeframe: string): Promise<string> {
  const { startDate, endDate } = getDateRange(timeframe);
  let briefing = `📋 BRIEFING FÜR ${timeframe.toUpperCase()} (${formatDate(startDate)} - ${formatDate(endDate)})\n\n`;

  // Kalender
  briefing += "📅 KALENDER:\n";
  const events = await getCalendarEvents(startDate, endDate);
  briefing += events || "Keine Termine\n";
  briefing += "\n";

  // Erinnerungen
  briefing += "✅ ERINNERUNGEN:\n";
  const reminders = await getReminders();
  briefing += reminders || "Keine offenen Erinnerungen\n";
  briefing += "\n";

  // E-Mails
  briefing += "📧 UNGELESENE E-MAILS (Top 10):\n";
  const mail = await getUnreadMail();
  briefing += mail || "Keine ungelesenen E-Mails\n";
  briefing += "\n";

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
          "Erstellt ein umfassendes Briefing mit Kalendereinträgen, Erinnerungen und E-Mails für einen Zeitraum. Standard ist 'heute', möglich sind auch 'wochenende', 'woche', oder benutzerdefinierte Zeiträume.",
        inputSchema: {
          type: "object",
          properties: {
            timeframe: {
              type: "string",
              description: "Zeitraum für das Briefing: 'heute', 'wochenende', 'woche', oder benutzerdefiniert",
              default: "heute",
            },
          },
        },
      },
      {
        name: "get_calendar_events",
        description: "Listet alle Kalendereinträge für einen bestimmten Zeitraum",
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
        description: "Zeigt alle offenen Erinnerungen und Aufgaben",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_unread_mail",
        description: "Zeigt die letzten 10 ungelesenen E-Mails",
        inputSchema: {
          type: "object",
          properties: {},
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
