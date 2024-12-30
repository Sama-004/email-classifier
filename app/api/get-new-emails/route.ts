import { NextResponse } from "next/server";
import { emails } from "@/db/schema";
import { db } from "@/db";
import Imap from "node-imap";
import { simpleParser } from "mailparser";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

if (!process.env.EMAIL || !process.env.EMAIL_PASSWORD) {
  throw new Error("EMAIL and EMAIL_PASSWORD must be set");
}

const imapConfig = {
  user: process.env.EMAIL,
  password: process.env.EMAIL_PASSWORD,
  host: "imap.gmail.com",
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false },
};

async function categorizeEmail(content: string): Promise<string> {
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are an email categorization assistant. Categorize emails into: Work, Personal, Finance, Shopping, Travel, or suggest a new category if none fit. Respond only with the category name.",
        },
        {
          role: "user",
          content: `Categorize this email:\n${content}`,
        },
      ],
      model: "llama3-8b-8192",
    });
    return completion.choices[0]?.message?.content?.trim() || "Uncategorized";
  } catch (error) {
    console.error("Error calling Groq:", error);
    return "Uncategorized";
  }
}

async function applyGmailLabel(
  imap: Imap,
  uid: number,
  category: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const boxName = `${category.replace(/\s+/g, "_")}`;
    imap.addBox(boxName, (boxErr) => {
      if (boxErr && boxErr.textCode !== "ALREADYEXISTS") {
        console.error("Error creating box:", boxErr);
        reject(boxErr);
        return;
      }
      imap.copy([uid], boxName, (copyErr) => {
        if (copyErr) {
          console.error("Error copying message:", copyErr);
          reject(copyErr);
        } else {
          console.log(`Successfully categorized message to ${boxName}`);
          resolve();
        }
      });
    });
  });
}

function processEmail(stream: any, imap: Imap, uid: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    simpleParser(stream, async (err, parsed) => {
      if (err) {
        reject(err);
        return;
      }
      try {
        // Get email content for categorization
        const emailContent = `
          Subject: ${parsed.subject}
          From: ${parsed.from?.text}
          Body: ${parsed.text}
        `;
        // Get category from Ollama
        const category = await categorizeEmail(emailContent);
        // Store in database
        await db.insert(emails).values({
          sender: parsed.from?.text || "",
          subject: parsed.subject || "",
          timestamp: Math.floor(
            (parsed.date?.getTime() || new Date().getTime()) / 1000
          ),
          messageId: parsed.messageId || "",
          category: category,
        });
        // Apply Gmail label
        try {
          await applyGmailLabel(imap, uid, category);
          console.log(
            `[${new Date().toISOString()}] Applied label "${category}" to email "${
              parsed.subject
            }" (UID: ${uid})`
          );
        } catch (labelError) {
          console.error("Error applying label:", labelError);
        }
        console.log(
          `[${new Date().toISOString()}] Processed: Email "${
            parsed.subject
          }" categorized as "${category}"`
        );
        resolve(true);
      } catch (error) {
        console.error("Error processing email:", error);
        reject(error);
      }
    });
  });
}

function fetchEmails(): Promise<number> {
  return new Promise((resolve, reject) => {
    const imap = new Imap(imapConfig);
    let processedCount = 0;
    const startTime = new Date().toISOString();
    console.log(`[${startTime}] Starting email fetch process...`);

    imap.once("ready", () => {
      imap.openBox("INBOX", false, async (err, box) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          const results = await new Promise<number[]>(
            (searchResolve, searchReject) => {
              imap.search(
                ["UNSEEN", ["SINCE", "Dec 29 2024"]],
                (err, results) => {
                  if (err) searchReject(err);
                  else searchResolve(results);
                }
              );
            }
          );

          if (!results.length) {
            console.log(`[${new Date().toISOString()}] No unread emails`);
            imap.end();
            resolve(0);
            return;
          }

          const fetch = imap.fetch(results, { bodies: "", markSeen: false });
          const promises: Promise<any>[] = [];

          fetch.on("message", (msg, seqno) => {
            const promise = new Promise<boolean>((messageResolve) => {
              msg.on("body", async (stream) => {
                try {
                  const processed = await processEmail(stream, imap, seqno);
                  if (processed) {
                    await new Promise<void>((flagResolve, flagReject) => {
                      imap.setFlags(results, ["\\Seen"], (err) => {
                        if (err) {
                          flagReject(err);
                        } else {
                          processedCount++;
                          flagResolve();
                        }
                      });
                    });
                  }
                  messageResolve(processed);
                } catch (error) {
                  messageResolve(false);
                }
              });
            });
            promises.push(promise);
          });

          fetch.once("error", (err) => {
            reject(err);
          });

          fetch.once("end", () => {
            Promise.all(promises)
              .then(() => {
                imap.end();
                resolve(processedCount);
              })
              .catch((err) => {
                imap.end();
                reject(err);
              });
          });
        } catch (error) {
          imap.end();
          reject(error);
        }
      });
    });

    imap.once("error", (err) => {
      reject(err);
    });

    imap.connect();
  });
}

export async function GET() {
  try {
    const processedCount = await fetchEmails();
    return NextResponse.json({
      success: true,
      emailsProcessed: processedCount,
    });
  } catch (error) {
    console.error("Error fetching emails:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch emails" },
      { status: 500 }
    );
  }
}
