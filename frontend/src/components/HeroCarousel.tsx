'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Calendar, MapPin, ArrowRight } from 'lucide-react'

interface Slide {
  id: number
  title: string
  date: string
  location: string
  category: string
  description: string
  image: string
}

export default function HeroCarousel({ slides }: { slides: Slide[] }) {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setActive(prev => (prev + 1) % slides.length)
    }, 5500)
    return () => clearInterval(timer)
  }, [slides.length])

  return (
    <div data-testid="hero-carousel" className="relative">
      <div className="relative h-[72svh] min-h-[540px] w-full overflow-hidden">
        {slides.map((slide, i) => (
          <div
            key={slide.id}
            className={`absolute inset-0 transition-opacity duration-700 ${
              i === active ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            data-testid={`hero-slide-${slide.id}`}
          >
            <img
              src={slide.image}
              alt={slide.title}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
            <div className="absolute inset-0 flex flex-col justify-end px-6 sm:px-10 lg:px-16 pb-20 sm:pb-24">
              <span className="inline-flex w-fit items-center text-white/65 text-[10px] uppercase tracking-[0.24em] font-semibold mb-5">
                {slide.category}
              </span>
              <h1 className="font-heading text-5xl sm:text-7xl lg:text-8xl font-semibold text-white max-w-5xl leading-[0.88] tracking-[-0.055em]">
                {slide.title}
              </h1>
              <p className="text-white/70 mt-6 max-w-xl text-sm sm:text-base leading-relaxed">
                {slide.description}
              </p>
              <div className="flex flex-wrap items-center gap-5 mt-6 text-white/60 text-xs uppercase tracking-[0.08em]">
                <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" />{slide.date}</span>
                <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{slide.location}</span>
              </div>
              <div className="flex flex-wrap gap-5 mt-8">
                <Link
                  href={`/events/${slide.id}`}
                  data-testid={`hero-details-button-${slide.id}`}
                  className="inline-flex items-center gap-2 bg-white text-black px-6 py-3.5 font-semibold text-sm hover:bg-white/90 transition-all"
                >
                  Vezi detalii <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/signup"
                  data-testid={`hero-join-button-${slide.id}`}
                  className="inline-flex items-center border border-white/35 text-white px-6 py-3.5 font-semibold text-sm hover:bg-white hover:text-black transition-all"
                >
                  Alătură-te
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="absolute bottom-7 left-6 sm:left-10 lg:left-16 z-10 flex items-center gap-2">
        {slides.map((_, i) => (
          <button
            key={i}
            data-testid={`hero-dot-${i}`}
            onClick={() => setActive(i)}
            aria-label={`Slide ${i + 1}`}
            className={`h-2 rounded-full transition-all ${
              i === active ? 'w-10 bg-white' : 'w-2 bg-white/35 hover:bg-white/60'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
