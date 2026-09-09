import { useState } from 'react'

const NAV_LINKS = ['Labs', 'Studio', 'Openings', 'Shop']

export default function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Fixed navbar */}
      <nav
        className="fixed top-0 left-0 w-full flex flex-row justify-between items-center px-5 sm:px-8 py-4 sm:py-5"
        style={{ zIndex: 10 }}
      >
        {/* Logo */}
        <div className="flex flex-row items-center gap-3">
          <span
            className="text-[21px] sm:text-[26px] tracking-tight text-white"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Mainframe(R)
          </span>
          <span
            className="text-[25px] sm:text-[30px] text-white select-none"
            style={{ letterSpacing: '-0.02em' }}
            aria-hidden="true"
          >
            ✳︎
          </span>
        </div>

        {/* Desktop nav links */}
        <div className="hidden md:flex flex-row text-[23px] text-white">
          {NAV_LINKS.map((label, i) => (
            <span key={label}>
              <a
                href="#"
                className="hover:opacity-60 transition-opacity"
              >
                {label}
              </a>
              {i < NAV_LINKS.length - 1 ? ', ' : ''}
            </span>
          ))}
        </div>

        {/* Desktop CTA */}
        <a
          href="#"
          className="hidden md:inline-block text-[23px] text-white underline underline-offset-2 hover:opacity-60 transition-opacity"
        >
          Get in touch
        </a>

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label="Toggle menu"
          onClick={() => setOpen((v) => !v)}
          className="flex md:hidden flex-col justify-center items-center gap-[5px]"
        >
          <span
            className="w-6 h-[2px] bg-white transition-all duration-300"
            style={
              open
                ? { transform: 'translateY(7px) rotate(45deg)' }
                : undefined
            }
          />
          <span
            className="w-6 h-[2px] bg-white transition-all duration-300"
            style={open ? { opacity: 0 } : undefined}
          />
          <span
            className="w-6 h-[2px] bg-white transition-all duration-300"
            style={
              open
                ? { transform: 'translateY(-7px) rotate(-45deg)' }
                : undefined
            }
          />
        </button>
      </nav>

      {/* Mobile overlay */}
      <div
        className="fixed inset-0 flex md:hidden flex-col justify-center items-start px-8 gap-8 bg-black/90 backdrop-blur-md transition-opacity duration-300"
        style={{
          zIndex: 9,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {NAV_LINKS.map((label) => (
          <a
            key={label}
            href="#"
            className="text-[32px] font-medium text-white hover:opacity-60 transition-opacity"
            onClick={() => setOpen(false)}
          >
            {label}
          </a>
        ))}
        <a
          href="#"
          className="text-[32px] font-medium text-white underline hover:opacity-60 transition-opacity"
          onClick={() => setOpen(false)}
        >
          Get in touch
        </a>
      </div>
    </>
  )
}
