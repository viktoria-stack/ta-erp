import './globals.css'

export const metadata = {
  title: 'Tailored Athlete — ERP',
  description: 'Operations management for Tailored Athlete',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
