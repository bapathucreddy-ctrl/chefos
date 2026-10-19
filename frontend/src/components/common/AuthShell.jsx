import { Link } from "react-router-dom"
import Brand from "./Brand"
import Icon from "./Icon"

export default function AuthShell({ children, partner = false }) {
  return (
    <main className="auth-shell">
      <section className="auth-story">
        <Link to="/" className="auth-brand">
          <Brand />
        </Link>
        <div className="auth-story-copy">
          <span className="auth-eyebrow">
            {partner
              ? "WELCOME TO YOUR NEXT CHAPTER"
              : "A LITTLE TASTE OF HOME"}
          </span>
          <h1>
            {partner ? (
              <>
                Your passion.
                <br />
                Their favourite <em>meal.</em>
              </>
            ) : (
              <>
                Good food.
                <br />
                Better <em>everydays.</em>
              </>
            )}
          </h1>
          <p>
            {partner
              ? "Bring your craft to a kitchen that needs you. Build your schedule, meet your customers, and cook what you love."
              : "A personal chef. Your favourite flavours. Freshly cooked meals that make coming home feel even better."}
          </p>
          <img
            src="/meals/photo-1512621776951-a57141f2eefd.jpg"
            alt="Freshly prepared meal"
          />
          <div className="auth-story-trust">
            <Icon name="check" size={15} /> Thoughtfully planned. Freshly
            prepared.
          </div>
        </div>
        <span className="auth-story-footer">
          Made with care. Served with love.
        </span>
      </section>
      <section className="auth-form-side">
        <Link to="/" className="auth-back">
          <Icon name="arrow" size={17} /> Back to your kitchen
        </Link>
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        {children}
        <p className="auth-switch">
          {partner
            ? "Looking for your personal chef?"
            : "Love cooking for others?"}{" "}
          <Link to={partner ? "/user/login" : "/chef/login"}>
            {partner ? "Customer login" : "Join as a chef"}{" "}
            <Icon name="arrow" size={14} />
          </Link>
        </p>
      </section>
    </main>
  )
}
