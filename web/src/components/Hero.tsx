import DigitalTwin from './DigitalTwin'

export default function Hero() {
  return (
    <section
      className="relative h-screen flex flex-col justify-end pb-10 md:justify-center md:pb-0 px-5 sm:px-8 md:px-10 overflow-hidden"
      style={{ zIndex: 1 }}
    >
      <div className="w-full max-w-[420px] relative z-10">
        <DigitalTwin />
      </div>
    </section>
  )
}
