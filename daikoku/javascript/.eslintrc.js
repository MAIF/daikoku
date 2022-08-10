module.exports = {
  env: {
    browser: true,
    node: true,
    es2021: true,
    },
  extends: [
        "eslint:recommended",
        "plugin:import/errors",
        "plugin:react/recommended",
    ],
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
        },
    ecmaVersion: "latest",
    sourceType: "module",
    },
  plugins: [
        "react",
        "import"
    ],
  rules: {
        "prefer-const": "off",
        "react/display-name": "off",
        "react/prop-types": "off"
    },
  settings: {
        "react": {
            "version": "detect"
        }
    }
};
