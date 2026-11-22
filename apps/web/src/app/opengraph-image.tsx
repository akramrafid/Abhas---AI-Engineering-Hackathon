import { ImageResponse } from "next/og";

export const alt =
  "Abhas (আভাস) — Ward-level dengue early warning for 60 wards across Bangladesh";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 64px",
          background:
            "linear-gradient(135deg, #000836 0%, #001489 62%, #1448FF 100%)",
          color: "#FFFFFF",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                background: "#1448FF",
                border: "2px solid rgba(255,255,255,0.28)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "24px",
                fontWeight: 800,
                color: "#D4F53C",
              }}
            >
              Λ
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                style={{
                  fontSize: "28px",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                }}
              >
                ABHAS
              </span>
              <span style={{ fontSize: "14px", color: "#DCE6F9" }}>
                Ward-Level Dengue Early Warning · Bangladesh
              </span>
            </div>
          </div>

          <div
            style={{
              padding: "10px 20px",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.25)",
              fontSize: "16px",
              fontWeight: 700,
              color: "#D4F53C",
            }}
          >
            60 Wards · 5 City Corporations
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div
            style={{
              fontSize: "60px",
              fontWeight: 800,
              lineHeight: 1.06,
              letterSpacing: "-0.03em",
              maxWidth: "980px",
            }}
          >
            Know which wards will rise, three weeks before they do.
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: 600,
              color: "#DCE6F9",
            }}
          >
            Rain today. Risk in three weeks.{" "}
            <span style={{ color: "#D4F53C", fontWeight: 800 }}>Act now.</span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "20px",
            borderTop: "1px solid rgba(255,255,255,0.18)",
            paddingTop: "24px",
          }}
        >
          {[
            { k: "~20% lower MAE", v: "1.01 vs 1.26 baseline (+3w)" },
            { k: "0.59 ms / ward", v: "954.6 KiB CPU-only LightGBM" },
            { k: "0 PII · Offline", v: "DNCC · DSCC · CCC · GCC · NCC" },
          ].map((stat) => (
            <div
              key={stat.k}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                padding: "14px 18px",
                borderRadius: "12px",
                background: "rgba(0, 8, 54, 0.45)",
                border: "1px solid rgba(255,255,255,0.14)",
              }}
            >
              <span
                style={{ fontSize: "22px", fontWeight: 800, color: "#FFFFFF" }}
              >
                {stat.k}
              </span>
              <span style={{ fontSize: "14px", color: "#DCE6F9" }}>
                {stat.v}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
