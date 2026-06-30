/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // "Glass cockpit at dusk" — a desaturated instrument palette.
        ink: "#0E1419", // page base — an unlit bezel
        panel: "#18222B", // raised instrument faces
        "panel-hi": "#1F2B35", // hover / lifted surface
        line: "#2A3742", // hairlines, dividers, borders
        mute: "#8696A3", // placards, secondary text
        chalk: "#EAEFF2", // primary text — soft instrument white
        // The EFIS course line — the single primary accent, used with restraint.
        course: "#EC5FA4",
        "course-dim": "#7A3056",
        // Dusk-horizon amber — a restrained second signal (cautions, relaxed notes).
        amber: "#E0A23D",
      },
      fontFamily: {
        // Chakra Petch = the instrument/HUD voice; Inter = readable prose.
        instrument: ['"Chakra Petch"', "system-ui", "sans-serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
      },
      letterSpacing: {
        placard: "0.22em",
      },
      maxWidth: {
        deck: "44rem", // the single-column reading width
      },
      boxShadow: {
        course: "0 0 0 1px rgba(236,95,164,0.55), 0 0 22px -6px rgba(236,95,164,0.5)",
        panel: "0 1px 0 0 rgba(255,255,255,0.03), 0 18px 40px -24px rgba(0,0,0,0.8)",
      },
      keyframes: {
        sweep: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "course-dash": {
          to: { "stroke-dashoffset": "-16" },
        },
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        sweep: "sweep 2.4s linear infinite",
        "course-dash": "course-dash 0.6s linear infinite",
        "rise-in": "rise-in 0.45s cubic-bezier(0.22,1,0.36,1) both",
        "pulse-soft": "pulse-soft 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
