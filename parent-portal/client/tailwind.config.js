/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Light mode colors - lighter, softer palette
        primary: '#1e40af', // Lighter blue for primary
        'primary-light': '#3b82f6', // Even lighter blue
        secondary: '#0891b2', // Cyan secondary
        surface: '#f8fafc', // Very light gray surface
        'surface-low': '#f1f5f9', // Light gray
        'surface-high': '#e2e8f0', // Medium light gray
        accent: '#6366f1', // Indigo accent
        'accent-light': '#818cf8', // Lighter indigo
        
        // Dark mode colors - dark blue theme instead of black
        'dark-primary': '#1e3a8a', // Dark blue primary
        'dark-primary-light': '#2563eb', // Lighter dark blue
        'dark-secondary': '#0f766e', // Dark cyan secondary
        'dark-surface': '#0f172a', // Dark blue surface (instead of gray-900)
        'dark-surface-low': '#1e293b', // Dark blue low surface
        'dark-surface-high': '#334155', // Dark blue high surface
        'dark-accent': '#4f46e5', // Dark indigo accent
        'dark-accent-light': '#6366f1', // Lighter dark indigo
      },
      fontFamily: {
        'headline': ['Manrope', 'sans-serif'],
        'body': ['Inter', 'sans-serif'],
      },
      backgroundImage: {
        'login-gradient': 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
        'login-gradient-dark': 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
      }
    },
  },
  darkMode: 'class',
  plugins: [],
}
