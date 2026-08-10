/** @type {import('tailwindcss').Config} */
import PrimeUI from 'tailwindcss-primeui';

export default {
    darkMode: ['selector', '[class*="app-dark"]'],
    content: ['./index.html', './src/**/*.{html,js,ts}', './public/**/*.json'],
    plugins: [PrimeUI],
    theme: {
        extend: {
            colors: {
                // ZINC-BASED NEUTRALS (Primary UI Colors - 90% of UI)
                zinc: {
                    50: '#fafafa',   // Backgrounds
                    100: '#f4f4f5',  // Hover states
                    200: '#e4e4e7',  // Borders & dividers
                    300: '#d4d4d8',  // Disabled states
                    400: '#a1a1aa',  // Placeholder text
                    500: '#71717a',  // Muted text
                    600: '#52525b',  // Secondary text
                    700: '#3f3f46',  // Subtle emphasis
                    800: '#27272a',  // Strong emphasis
                    900: '#18181b',  // Primary text
                },
                // INDIGO (Primary Actions & Brand)
                indigo: {
                    50: '#eef2ff',   // Subtle backgrounds
                    100: '#e0e7ff',  // Light backgrounds
                    200: '#c7d2fe',  // Borders
                    300: '#a5b4fc',  // Focus rings
                    400: '#818cf8',  // Light variant
                    500: '#6366f1',  // Medium
                    600: '#4f46e5',  // PRIMARY ACTION (main)
                    700: '#4338ca',  // Hover state
                    800: '#3730a3',  // Active state
                    900: '#312e81',  // Dark variant
                },
                // BLUE (Info States)
                blue: {
                    50: '#eff6ff',   // Info backgrounds
                    100: '#dbeafe',
                    200: '#bfdbfe',  // Info borders
                    300: '#93c5fd',
                    400: '#60a5fa',
                    500: '#3b82f6',
                    600: '#2563eb',  // INFO (main)
                    700: '#1d4ed8',
                    800: '#1e40af',
                    900: '#1e3a8a',
                },
                // STATUS COLORS (Muted, Calm)
                emerald: {
                    50: '#ecfdf5',   // Success backgrounds
                    100: '#d1fae5',
                    200: '#a7f3d0',  // Success borders
                    300: '#6ee7b7',
                    400: '#34d399',
                    500: '#10b981',
                    600: '#059669',  // SUCCESS (main)
                    700: '#047857',
                    800: '#065f46',
                    900: '#064e3b',
                },
                amber: {
                    50: '#fffbeb',   // Warning backgrounds
                    100: '#fef3c7',
                    200: '#fde68a',  // Warning borders
                    300: '#fcd34d',
                    400: '#fbbf24',
                    500: '#f59e0b',
                    600: '#d97706',  // WARNING (main)
                    700: '#b45309',
                    800: '#92400e',
                    900: '#78350f',
                },
                rose: {
                    50: '#fff1f2',   // Error backgrounds
                    100: '#ffe4e6',
                    200: '#fecdd3',  // Error borders
                    300: '#fda4af',
                    400: '#fb7185',
                    500: '#f43f5e',
                    600: '#e11d48',  // ERROR (main)
                    700: '#be185d',
                    800: '#9f1239',
                    900: '#881337',
                },
            },
        },
        screens: {
            sm: '576px',
            md: '768px',
            lg: '992px',
            xl: '1200px',
            '2xl': '1920px'
        }
    }
};
