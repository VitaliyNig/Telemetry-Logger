import type { Preview } from "@storybook/react-vite";
// Single import closure: styles.css @imports tokens.css and every component's CSS.
import "../src/styles.css";

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "app",
      values: [{ name: "app", value: "#0d1117" }],
    },
    controls: { matchers: { color: /(background|color)$/i } },
  },
  decorators: [
    (Story) => {
      document.body.style.background = "var(--color-bg-base)";
      document.body.style.color = "var(--color-text-primary)";
      document.body.style.fontFamily = "var(--font-sans)";
      return Story();
    },
  ],
};

export default preview;
