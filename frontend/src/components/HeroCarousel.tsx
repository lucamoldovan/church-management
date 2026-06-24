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
      <div className="relative h-[440px] sm:h-[520px] rounded-3xl overflow-hidden soft-shadow-lg">
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
            <div className="absolute inset-0 flex flex-col justify-end p-7 sm:p-12">
              <span className="inline-flex w-fit items-center rounded-full bg-white/15 backdrop-blur-md text-white text-xs font-medium px-3 py-1.5 mb-4">
                {slide.category}
              </span>
              <h1 className="font-heading text-3xl sm:text-5xl font-bold text-white max-w-2xl leading-tight">
                {slide.title}
              </h1>
              <p className="text-white/85 mt-3 max-w-xl text-sm sm:text-base leading-relaxed">
                {slide.description}
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-5 text-white/90 text-sm">
                <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" />{slide.date}</span>
                <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{slide.location}</span>
              </div>
              <div className="flex flex-wrap gap-3 mt-7">
                <Link
                  href={`/events/${slide.id}`}
                  data-testid={`hero-details-button-${slide.id}`}
                  className="inline-flex items-center gap-2 bg-white text-foreground px-6 py-3 rounded-full font-semibold text-sm hover:bg-white/90 transition-all hover:-translate-y-0.5"
                >
                  Vezi detalii <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/signup"
                  data-testid={`hero-join-button-${slide.id}`}
                  className="inline-flex items-center bg-primary text-primary-foreground px-6 py-3 rounded-full font-semibold text-sm hover:bg-primary/90 transition-all hover:-translate-y-0.5"
                >
                  Alătură-te
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2 mt-5">
        {slides.map((_, i) => (
          <button
            key={i}
            data-testid={`hero-dot-${i}`}
            onClick={() => setActive(i)}
            aria-label={`Slide ${i + 1}`}
            className={`h-2 rounded-full transition-all ${
              i === active ? 'w-8 bg-primary' : 'w-2 bg-border hover:bg-muted-foreground/50'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
