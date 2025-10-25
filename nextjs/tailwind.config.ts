import type { Config } from 'tailwindcss'

const config: Config = {
    content: [
        './pages/**/*.{js,ts,jsx,tsx,mdx}',
        './components/**/*.{js,ts,jsx,tsx,mdx}',
        './app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: '#171717',
                    light: '#ededed',
                },
                secondary: {
                    DEFAULT: '#666666',
                    light: '#bbbbbb',
                },
                accent: {
                    DEFAULT: '#667eea',
                    light: '#a5b4fc',
                },
            },
        },
    },
    plugins: [],
}
export default config