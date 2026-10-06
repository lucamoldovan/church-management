import Link from 'next/link'
import { Wheat, MapPin, ArrowUpRight } from 'lucide-react'
import { FaFacebook } from 'react-icons/fa'

export default function Footer() {
  return (
    <footer data-testid="main-footer" className="border-t border-border/60 bg-secondary/25 mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
        <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr] gap-10 sm:gap-14">
          <div>
            <div className="flex items-center gap-3 mb-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground"><Wheat className="h-5 w-5" /></span>
              <div>
                <span className="block font-heading font-semibold text-lg leading-none">Casa Pâinii</span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Ocna Mureș</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
              Biserica Creștină Penticostală Casa Pâinii din Ocna Mureș — o familie a credinței, speranței și dragostei.
            </p>
          </div>
          <div>
            <h4 className="font-heading font-semibold mb-4">Explorează</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/events" data-testid="footer-link-events" className="hover:text-primary transition-colors">Evenimente</Link></li>
              <li><Link href="/live" data-testid="footer-link-live" className="hover:text-primary transition-colors">Watch Live</Link></li>
              <li><Link href="/groups" data-testid="footer-link-groups" className="hover:text-primary transition-colors">Grupuri</Link></li>
              <li><Link href="/about" data-testid="footer-link-about" className="hover:text-primary transition-colors">Despre noi</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-heading font-semibold mb-4">Rămâi conectat</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary shrink-0" />Ocna Mureș, județul Alba</li>
              <li>
                <a href="https://www.facebook.com/CasaPainii.OcnaMures/" target="_blank" rel="noopener noreferrer" data-testid="footer-facebook-link" className="inline-flex items-center gap-2 hover:text-primary transition-colors">
                  <FaFacebook className="h-4 w-4" /> Facebook <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border/60 mt-12 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Casa Pâinii Ocna Mureș. Toate drepturile rezervate.</span>
          <span>Credință · Comunitate · Speranță</span>
        </div>
      </div>
    </footer>
  )
}