import { describe, expect, it } from "vitest";
import { deliverEmail, readSmtpSettings } from "../lib/email";

describe("smtp fallback", () => {
  it("treats a missing host as unconfigured", () => {
    expect(readSmtpSettings({})).toBeNull();
    expect(readSmtpSettings({ SMTP_HOST: "smtp.example.com", SMTP_PORT: "465" })).toMatchObject({
      host: "smtp.example.com",
      port: 465,
      secure: true,
    });
  });

  it("logs the message instead of sending when SMTP is not configured", async () => {
    const lines: string[] = [];
    const result = await deliverEmail(
      {
        to: "demo@xiami.app",
        subject: "【瞎謎】事件已結案：早餐",
        text: "標題：早餐",
        html: "<p>早餐</p>",
      },
      {},
      (line) => lines.push(line),
    );
    expect(result.mode).toBe("log");
    expect(lines.join("\n")).toContain("未設定 SMTP");
    expect(lines.join("\n")).toContain("demo@xiami.app");
    expect(lines.join("\n")).toContain("標題：早餐");
  });
});
