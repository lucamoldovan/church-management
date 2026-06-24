import Link from 'next/link'
import { Wheat, MapPin } from 'lucide-react'
import { FaFacebook } from 'react-icons/fa'

export default function Footer() {
  return (
    <footer
      data-testid="main-footer"
      className="border-t border-border/60 bg-secondary/30 mt-24"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid grid-cols-1 md:grid-cols-3 gap-10">
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Wheat className="h-5 w-5" />
            </span>
            <span className="font-heading font-semibold text-lg">Casa Pâinii</span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
            Biserica Creștină Penticostală Casa Pâinii din Ocna Mureș. O familie a credinței, speranței și dragostei.
          </p>
        </div>
        <div>
          <h4 className="font-heading font-semibold mb-4 text-sm uppercase tracking-wide text-foreground/70">
            Linkuri rapide
          </h4>
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            <li><Link href="/events" data-testid="footer-link-events" className="hover:text-primary transition-colors">Evenimente</Link></li>
            <li><Link href="/live" data-testid="footer-link-live" className="hover:text-primary transition-colors">Watch Live</Link></li>
            <li><Link href="/about" data-testid="footer-link-about" className="hover:text-primary transition-colors">Despre noi</Link></li>
            <li><Link href="/contact" data-testid="footer-link-contact" className="hover:text-primary transition-colors">Contact</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-heading font-semibold mb-4 text-sm uppercase tracking-wide text-foreground/70">
            Contact
          </h4>
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" /> Ocna Mureș, județul Alba
            </li>
            <li>
              <a
                href="https://www.facebook.com/CasaPainii.OcnaMures/"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="footer-facebook-link"
                className="inline-flex items-center gap-2 hover:text-primary transition-colors"
              >
                <FaFacebook className="h-4 w-4" /> Facebook
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/60 text-center py-5 text-xs text-muted-foreground">
        © {new Date().getFullYear()} Casa Pâinii Ocna Mureș. Toate drepturile rezervate.
      </div>
    </footer>
  )
}
