/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Spreadsheet-specific colors
        'grid-line': '#e2e8f0',
        'grid-header': '#f8fafc',
        'grid-header-border': '#cbd5e1',
        'selection': 'rgba(26, 115, 232, 0.15)',
        'selection-border': '#1a73e8',
        'cell-active': '#1a73e8',
      },
      fontFamily: {
        'spreadsheet': ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'sans-serif'],
        'mono': ['Consolas', 'Monaco', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
}
