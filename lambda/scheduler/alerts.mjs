import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({});
const FROM_EMAIL = process.env.ALERT_FROM_EMAIL || "noreply@example.com";

export async function sendRegressionAlert(project, regressions, scanTimestamp) {
  const alertEmail = project.alertEmail;
  if (!alertEmail) return { sent: false, reason: "no-alert-email" };

  const metricLines = regressions
    .map((r) => {
      const arrow = r.afterValue > r.beforeValue ? "↑" : "↓";
      let line = `  • ${r.metricName}: ${r.beforeValue} → ${r.afterValue} ${arrow}`;
      if (r.explanationText) {
        line += `\n    AI insight: ${r.explanationText}`;
      }
      return line;
    })
    .join("\n\n");

  const subject = `[SiteGuardian] ${regressions.length} regression(s) on ${project.name}`;

  const body = `SiteGuardian detected ${regressions.length} regression(s) on your site.

Project: ${project.name}
URL: ${project.url}
Scan time: ${scanTimestamp}

Regressions:
${metricLines}

View details: ${process.env.APP_URL || "https://siteguardian.dev"}/project/${project.projectId}

—
SiteGuardian — Website Health Monitoring`;

  try {
    await ses.send(
      new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [alertEmail] },
        Message: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: body, Charset: "UTF-8" },
          },
        },
      }),
    );
    console.log(`Alert email sent to ${alertEmail}`);
    return { sent: true };
  } catch (err) {
    console.error(`Failed to send alert: ${err.message}`);
    return { sent: false, reason: err.message };
  }
}
