import globals from "globals";
export default [{ files: ["js/**/*.js"], languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.browser, pdfjsLib: "readonly" } }, rules: { "no-undef": "error", "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }], "no-dupe-keys": "error", "no-unreachable": "error", "no-redeclare": "error" } }];
