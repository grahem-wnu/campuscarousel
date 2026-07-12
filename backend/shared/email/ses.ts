// Minimal transactional email over Amazon SES v2. The shared seam is `EmailSender` so handlers and
// tests inject a fake; production resolves a real SES client lazily (built on first send) so importing
// this module never reaches out to AWS. Used by the deadline-reminder digest (v2.1 F1).

import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSender {
  send(msg: EmailMessage): Promise<void>;
}

/** Real SES-backed sender. The client is created on the first send so importing this stays
 *  side-effect free (mirrors how the Bedrock client is resolved lazily). */
export function sesSender(region?: string): EmailSender {
  let client: SESv2Client | undefined;
  const get = (): SESv2Client => (client ??= new SESv2Client(region ? { region } : {}));
  return {
    async send(msg) {
      await get().send(
        new SendEmailCommand({
          FromEmailAddress: msg.from,
          Destination: { ToAddresses: [msg.to] },
          Content: {
            Simple: {
              Subject: { Data: msg.subject, Charset: 'UTF-8' },
              Body: {
                Text: { Data: msg.text, Charset: 'UTF-8' },
                ...(msg.html ? { Html: { Data: msg.html, Charset: 'UTF-8' } } : {}),
              },
            },
          },
        }),
      );
    },
  };
}

export function sesSenderFromEnv(env: NodeJS.ProcessEnv = process.env): EmailSender {
  return sesSender(env.SES_REGION ?? env.AWS_REGION);
}
