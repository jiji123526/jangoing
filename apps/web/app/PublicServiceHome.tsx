import {
  ChevronRight,
  CircleUserRound,
  Clock3,
  PackageOpen,
  ShieldCheck,
  ShoppingBasket,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import React from "react";

const publicFeatures = [
  {
    title: "Inventory",
    subtitle: "Know what is available",
    artwork: "inventory",
    icon: PackageOpen,
  },
  {
    title: "Shopping List",
    subtitle: "Keep purchases in sync",
    artwork: "shopping",
    icon: ShoppingBasket,
  },
  {
    title: "Use First",
    subtitle: "Prioritize leftovers",
    artwork: "leftovers",
    icon: Clock3,
  },
  {
    title: "Low Stock",
    subtitle: "See what needs replacing",
    artwork: "low",
    icon: TriangleAlert,
  },
] as const;

const exampleItems = [
  {
    name: "Milk",
    status: "Low, 2 left",
    emoji: "🥛",
    tone: "dairy",
  },
  {
    name: "Leftover pasta",
    status: "Use today",
    emoji: "🍝",
    tone: "leftover",
  },
  {
    name: "Eggs",
    status: "6 available",
    emoji: "🥚",
    tone: "eggs",
  },
  {
    name: "Coke Zero",
    status: "Out of stock",
    emoji: "🥤",
    tone: "drink",
  },
] as const;

const wastePreventionItems = [
  {
    eyebrow: "LEFTOVERS",
    title: "Dinner from yesterday",
    subtitle: "Use today",
    emoji: "🍲",
    tone: "meal",
  },
  {
    eyebrow: "EXPIRING SOON",
    title: "Baby spinach",
    subtitle: "2 days remaining",
    emoji: "🥬",
    tone: "produce",
  },
  {
    eyebrow: "RECENTLY ADDED",
    title: "Mandarin oranges",
    subtitle: "Added today",
    emoji: "🍊",
    tone: "fruit",
  },
] as const;

interface PublicServiceHomeProps {
  accountLabel: string;
  needsSetup: boolean;
  disabled?: boolean;
  onStart: () => void;
}

export function PublicServiceHome({
  accountLabel,
  needsSetup,
  disabled = false,
  onStart,
}: PublicServiceHomeProps) {
  return (
    <main className="public-home">
      <header className="public-home-titlebar">
        <h1>Jangoing</h1>
        <button
          className="public-home-account"
          type="button"
          aria-label={accountLabel}
          title={accountLabel}
          disabled={disabled}
          onClick={onStart}
        >
          <CircleUserRound size={27} strokeWidth={1.8} />
          {needsSetup && <span aria-hidden="true" />}
        </button>
      </header>

      <section className="public-home-featured" aria-labelledby="public-featured-title">
        <button type="button" disabled={disabled} onClick={onStart}>
          <div className="public-home-hero-art" aria-hidden="true">
            <span className="public-home-hero-item is-leaf">🥬</span>
            <span className="public-home-hero-item is-milk">🥛</span>
            <span className="public-home-hero-item is-fruit">🍊</span>
            <span className="public-home-hero-item is-eggs">🥚</span>
            <i>SHARED KITCHEN</i>
          </div>
          <span className="public-home-feature-copy">
            <small>JANGOING</small>
            <strong id="public-featured-title">Your kitchen, remembered</strong>
            <span>Shared inventory and shopping without the mental load.</span>
          </span>
        </button>
      </section>

      <section className="public-home-section" aria-labelledby="public-tracks-title">
        <div className="public-home-section-heading">
          <h2 id="public-tracks-title">What Jangoing Tracks</h2>
          <ChevronRight size={20} aria-hidden="true" />
        </div>
        <div className="public-home-shelf">
          {publicFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <button
                className="public-home-album"
                type="button"
                key={feature.title}
                disabled={disabled}
                onClick={onStart}
              >
                <span
                  className={`public-home-album-art is-${feature.artwork}`}
                  aria-hidden="true"
                >
                  <Icon size={38} strokeWidth={1.7} />
                  <i>JANGOING</i>
                </span>
                <strong>{feature.title}</strong>
                <small>{feature.subtitle}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="public-home-section public-home-example" aria-labelledby="public-example-title">
        <div className="public-home-section-heading">
          <div>
            <h2 id="public-example-title">Example Kitchen</h2>
            <small>Product preview</small>
          </div>
        </div>
        <div className="public-home-example-list">
          {exampleItems.map((item) => (
            <button
              type="button"
              key={item.name}
              disabled={disabled}
              onClick={onStart}
            >
              <span
                className={`public-home-item-art is-${item.tone}`}
                aria-hidden="true"
              >
                {item.emoji}
              </span>
              <span>
                <strong>{item.name}</strong>
                <small>{item.status}</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      <section className="public-home-section" aria-labelledby="public-household-title">
        <div className="public-home-section-heading">
          <h2 id="public-household-title">Built for Households</h2>
        </div>
        <button
          className="public-home-household"
          type="button"
          disabled={disabled}
          onClick={onStart}
        >
          <span className="public-home-household-art" aria-hidden="true">
            <i>J</i>
            <i>H</i>
            <i>M</i>
            <b>ABCD-EFGH-JK</b>
          </span>
          <span>
            <strong>One kitchen, everyone in sync</strong>
            <small>
              Join with a household code and update inventory or shopping
              together.
            </small>
          </span>
          <UsersRound size={24} aria-hidden="true" />
        </button>
      </section>

      <section className="public-home-section" aria-labelledby="public-waste-title">
        <div className="public-home-section-heading">
          <h2 id="public-waste-title">Waste Prevention</h2>
          <ChevronRight size={20} aria-hidden="true" />
        </div>
        <div className="public-home-shelf public-home-waste-shelf">
          {wastePreventionItems.map((item) => (
            <button
              className="public-home-waste-card"
              type="button"
              key={item.title}
              disabled={disabled}
              onClick={onStart}
            >
              <span
                className={`public-home-waste-art is-${item.tone}`}
                aria-hidden="true"
              >
                <i>{item.eyebrow}</i>
                <b>{item.emoji}</b>
              </span>
              <strong>{item.title}</strong>
              <small>{item.subtitle}</small>
            </button>
          ))}
        </div>
      </section>

      <footer className="public-home-privacy">
        <ShieldCheck size={26} strokeWidth={1.8} aria-hidden="true" />
        <div>
          <strong>Your kitchen stays private</strong>
          <p>
            Inventory and shopping data are available only to members of your
            household.
          </p>
        </div>
        <button type="button" disabled={disabled} onClick={onStart}>
          Get Started
        </button>
      </footer>
    </main>
  );
}
