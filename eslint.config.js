// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Colors must come from the theme (D-UI6). Enforced as an error.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/theme/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/#[0-9A-Fa-f]{3,8}\\b|rgba?\\(/]",
          message: "No color literals outside src/theme/: use useTheme() colors (D-UI6).",
        },
        {
          selector: "TemplateElement[value.raw=/#[0-9A-Fa-f]{3,8}\\b|rgba?\\(/]",
          message: "No color literals outside src/theme/: use useTheme() colors (D-UI6).",
        },
      ],
    },
  },
]);
