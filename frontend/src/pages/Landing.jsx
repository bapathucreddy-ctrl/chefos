import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import Brand from "../components/common/Brand"
import Icon from "../components/common/Icon"
import api from "../services/api"
import {
  ROLE_USER,
  getRoleUsername,
  isRoleAuthenticated
} from "../services/authSession"
import "./discover.css"

const meals = [
  {
    id: 1,
    name: "The everyday nourish bowl",
    cuisine: "Mediterranean",
    category: "Healthy",
    description:
      "Roasted vegetables, fluffy quinoa, avocado and a lemon tahini dressing.",
    image: "photo-1512621776951-a57141f2eefd",
    calories: 420,
    time: 25,
    rating: "4.9",
    tag: "CHEF'S PICK",
    veg: true
  },
  {
    id: 2,
    name: "Homestyle butter chicken",
    cuisine: "North Indian",
    category: "Indian",
    description:
      "Slow-cooked chicken in a rich tomato gravy, served with fragrant basmati rice.",
    image: "photo-1603894584373-5ac82b2ae398",
    calories: 560,
    time: 35,
    rating: "4.9",
    tag: "MOST LOVED",
    veg: false
  },
  {
    id: 3,
    name: "Pesto perfection pasta",
    cuisine: "Italian",
    category: "Italian",
    description:
      "Fresh basil pesto, cherry tomatoes, parmesan and perfectly cooked pasta.",
    image: "photo-1473093295043-cdd812d0e601",
    calories: 480,
    time: 20,
    rating: "4.8",
    veg: true
  },
  {
    id: 4,
    name: "The signature breakfast",
    cuisine: "Continental",
    category: "Breakfast",
    description:
      "Golden toast, farm eggs and fresh greens for a brighter start to your day.",
    image: "photo-1525351484163-7529414344d8",
    calories: 380,
    time: 15,
    rating: "4.8",
    tag: "RISE & SHINE",
    veg: false
  },
  {
    id: 5,
    name: "Garden fresh Buddha bowl",
    cuisine: "Asian inspired",
    category: "Healthy",
    description:
      "A colourful mix of seasonal vegetables, grains and our house dressing.",
    image: "photo-1540420773420-3366772f4999",
    calories: 360,
    time: 20,
    rating: "4.9",
    veg: true
  },
  {
    id: 6,
    name: "Rustic margherita pizza",
    cuisine: "Italian",
    category: "Italian",
    description:
      "Hand-stretched dough, fresh mozzarella, tomato and fragrant basil.",
    image: "photo-1574071318508-1cdbab80d002",
    calories: 620,
    time: 30,
    rating: "4.7",
    veg: true
  }
]
const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
]
const times = ["Breakfast", "Lunch", "Dinner"]
const categories = [
  { name: "All meals", icon: "chef" },
  { name: "Indian", emoji: "🍛" },
  { name: "Healthy", emoji: "🥑" },
  { name: "Italian", emoji: "🍝" },
  { name: "Breakfast", emoji: "🍳" }
]
const photo = (id) => `/meals/${id}.jpg`
function readStored(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key))
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export default function Landing() {
  const navigate = useNavigate()
  const authenticated = isRoleAuthenticated(ROLE_USER)
  const [tab, setTab] = useState("Discover")
  const [category, setCategory] = useState("All meals")
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState("Recommended")
  const [saved, setSaved] = useState(() => readStored("chefos_saved"))
  const [plan, setPlan] = useState(() => readStored("chefos_meal_plan"))
  const [selected, setSelected] = useState(null)
  const [panel, setPanel] = useState(false)
  const [toast, setToast] = useState("")
  const [notice, setNotice] = useState(false)
  const [day, setDay] = useState("Monday")
  const [mealTime, setMealTime] = useState("Lunch")
  const [vegetarian, setVegetarian] = useState(false)
  const username = getRoleUsername(ROLE_USER)
  const [pricingCatalog, setPricingCatalog] = useState(null)
  const [pricingCycle, setPricingCycle] = useState("monthly")
  const [pricingHousehold, setPricingHousehold] = useState("3-4")
  const [pricingMeals, setPricingMeals] = useState("1")
  useEffect(() => {
    const controller = new AbortController()
    api
      .get("pricing/", { signal: controller.signal })
      .then((res) => setPricingCatalog(res.data))
      .catch(() => {})
    return () => controller.abort()
  }, [])
  const mealQuote = pricingCatalog?.households?.find(
    (band) => band.id === pricingHousehold
  )?.plans?.[pricingCycle]?.[pricingMeals]
  useEffect(() => {
    if (!selected && !panel) return
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function keyboard(event) {
      if (event.key === "Escape") {
        setSelected(null)
        setPanel(false)
      }
      if (event.key !== "Tab") return
      const items = [
        ...document.querySelectorAll(
          '[role="dialog"] button, [role="dialog"] select, [role="dialog"] a'
        )
      ]
      const first = items[0],
        last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener("keydown", keyboard)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener("keydown", keyboard)
      previous?.focus()
    }
  }, [selected, panel])
  const filtered = useMemo(() => {
    const result = meals.filter(
      (m) =>
        (tab !== "Saved meals" || saved.includes(m.id)) &&
        (category === "All meals" || m.category === category) &&
        (!vegetarian || m.veg) &&
        `${m.name} ${m.cuisine}`.toLowerCase().includes(query.toLowerCase())
    )
    return sort === "Top rated"
      ? result.sort((a, b) => Number(b.rating) - Number(a.rating))
      : sort === "Quickest first"
        ? result.sort((a, b) => a.time - b.time)
        : result
  }, [tab, saved, category, vegetarian, query, sort])
  function tell(message) {
    setToast(message)
    window.setTimeout(() => setToast(""), 3000)
  }
  function toggleSave(id) {
    const next = saved.includes(id)
      ? saved.filter((s) => s !== id)
      : [...saved, id]
    setSaved(next)
    localStorage.setItem("chefos_saved", JSON.stringify(next))
  }
  function addMeal(meal) {
    const next = [
      ...plan.filter((p) => !(p.day === day && p.mealTime === mealTime)),
      { id: meal.id, day, mealTime }
    ]
    setPlan(next)
    localStorage.setItem("chefos_meal_plan", JSON.stringify(next))
    setSelected(null)
    tell(`Added to ${day}'s ${mealTime.toLowerCase()}`)
  }
  function removeMeal(index) {
    const next = plan.filter((_, i) => i !== index)
    setPlan(next)
    localStorage.setItem("chefos_meal_plan", JSON.stringify(next))
  }
  function changeTab(label) {
    setTab(label)
    setQuery("")
    setCategory("All meals")
  }
  const accountPath = authenticated ? "/user/dashboard" : "/user/login"
  return (
    <div className="discover-app">
      <aside className="app-sidebar">
        <Link to="/" className="sidebar-brand">
          <Brand />
        </Link>
        <p className="sidebar-caption">A LITTLE TASTE OF HOME</p>
        <div className="sidebar-rule" />
        <p className="nav-caption">YOUR KITCHEN</p>
        <nav aria-label="Main navigation">
          {[
            ["Discover", "home"],
            ["Saved meals", "heart"],
            ["Meal planner", "calendar"]
          ].map(([label, icon]) => (
            <button
              key={label}
              onClick={() => changeTab(label)}
              className={`sidebar-link ${tab === label ? "active" : ""}`}
            >
              <Icon name={icon} />
              <span>{label}</span>
              {label === "Saved meals" && saved.length > 0 && (
                <span className="nav-count">{saved.length}</span>
              )}
            </button>
          ))}
          <Link
            className="sidebar-link"
            to={authenticated ? "/user/find-chef" : "/user/login"}
          >
            <Icon name="chef" />
            <span>Find a chef</span>
            <span className="tiny-new">NEW</span>
          </Link>
          <Link
            className="sidebar-link"
            to={authenticated ? "/user/confirm" : "/user/login"}
          >
            <Icon name="bag" />
            <span>Subscriptions</span>
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="chef-invite">
            <span className="invite-icon">
              <Icon name="chef" size={27} />
            </span>
            <h3>Your kitchen. Our chef.</h3>
            <p>
              Freshly made meals,
              <br />
              without the everyday effort.
            </p>
            <Link to={authenticated ? "/user/find-chef" : "/user/signup"}>
              Meet your chef <Icon name="arrow" size={17} />
            </Link>
          </div>
          <Link className="sidebar-link partner-link" to="/chef/login">
            <Icon name="chef" />
            <span>Chef partner portal</span>
            <Icon name="arrow" size={16} />
          </Link>
          <div className="sidebar-footnote">
            Made with care. Served with love.
          </div>
        </div>
      </aside>
      <div className="app-workspace">
        <header className="discover-topbar">
          <Link to="/" className="mobile-brand">
            <Brand />
          </Link>
          <div className="delivery-address">
            <span className="location-icon">
              <Icon name="pin" />
            </span>
            <div>
              <span className="overline">YOUR PERSONAL KITCHEN</span>
              <button
                onClick={() =>
                  tell("Choose your service address when you book your chef.")
                }
              >
                Home-cooked happiness <span>⌄</span>
              </button>
            </div>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
              onClick={() => setNotice(!notice)}
            >
              <Icon name="bell" />
              <i />
            </button>
            <button className="plan-button" onClick={() => setPanel(true)}>
              <Icon name="bag" />
              <span>My plan</span>
              <b>{plan.length}</b>
            </button>
            <Link
              to={accountPath}
              className="profile-avatar"
              aria-label="Your account"
            >
              {username ? username[0].toUpperCase() : <Icon name="user" />}
            </Link>
          </div>
          {notice && (
            <div className="notification-popover">
              <strong>Your kitchen is ready</strong>
              <p>
                Save your favourite meals and build a weekly plan. Sign in when
                you’re ready to book a chef.
              </p>
              <button onClick={() => setNotice(false)}>
                Got it <Icon name="check" size={16} />
              </button>
            </div>
          )}
        </header>
        <main className="discover-main">
          <div className="welcome-row">
            <div>
              <p className="greeting">
                A little less cooking. A little more living.
              </p>
              <h1>
                {tab === "Discover" ? (
                  <>
                    Good food, <span>good mood.</span>
                  </>
                ) : tab === "Saved meals" ? (
                  <>
                    Your favourites, <span>all here.</span>
                  </>
                ) : (
                  <>
                    A delicious week <span>starts here.</span>
                  </>
                )}
              </h1>
            </div>
            <span className="fresh-label">
              <span /> Freshly made. Always.
            </span>
          </div>
          {tab === "Discover" && (
            <section className="discover-hero">
              <div className="hero-copy">
                <span className="hero-kicker">
                  <span /> THE COMFORT OF HOME, ON YOUR PLATE
                </span>
                <h2>
                  Your kind of food.
                  <br />
                  Your kind of <em>chef.</em>
                </h2>
                <p>
                  Thoughtfully planned. Freshly prepared.
                  <br />
                  Discover meals that feel a little more like you.
                </p>
                <button
                  onClick={() =>
                    navigate(authenticated ? "/user/find-chef" : "/user/signup")
                  }
                >
                  Find my personal chef <Icon name="arrow" size={18} />
                </button>
                <div className="hero-trust">
                  <span>
                    <Icon name="check" size={13} /> Verified chefs
                  </span>
                  <span>
                    <Icon name="check" size={13} /> Made in your kitchen
                  </span>
                </div>
              </div>
              <div className="hero-photo">
                <img
                  src={photo(meals[0].image)}
                  alt="A colourful bowl of freshly prepared vegetables"
                />
                <span className="hero-photo-shade" />
              </div>
              <div className="hero-floating">
                <span className="floating-icon">
                  <Icon name="leaf" size={21} />
                </span>
                <div>
                  <strong>Real food. Real care.</strong>
                  <span>Goodness in every bite.</span>
                </div>
              </div>
              <span className="hero-doodle">✳</span>
            </section>
          )}
          <section
            className="pricing-selector"
            aria-label="Chef service pricing"
          >
            <div>
              <span className="overline">CHEF SERVICE PRICING</span>
              <strong>
                {mealQuote
                  ? `₹${mealQuote.per_meal_inr} / home / meal`
                  : "Request your plan quote"}
              </strong>
              <p>
                {mealQuote
                  ? `₹${mealQuote.price_inr.toLocaleString("en-IN")} for ${mealQuote.days} days · Before GST${mealQuote.coupon_code ? ` · ${mealQuote.coupon_code} included` : ""}`
                  : "Prices are confirmed when you select your chef."}
              </p>
            </div>
            <div className="pricing-options">
              <label>
                Household
                <select
                  aria-label="Pricing household"
                  value={pricingHousehold}
                  onChange={(e) => setPricingHousehold(e.target.value)}
                >
                  {(
                    pricingCatalog?.households || [
                      { id: "1-2", label: "1-2 people" },
                      { id: "3-4", label: "3-4 people" },
                      { id: "5-6", label: "5-6 people" },
                      { id: "7-8", label: "7-8 people" }
                    ]
                  ).map((band) => (
                    <option key={band.id} value={band.id}>
                      {band.label}
                    </option>
                  ))}
                  <option value="9+">9+ · Custom quote</option>
                </select>
              </label>
              <label>
                Plan
                <select
                  aria-label="Pricing cycle"
                  value={pricingCycle}
                  onChange={(e) => setPricingCycle(e.target.value)}
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </label>
              <label>
                Meals per day
                <select
                  aria-label="Pricing meals per day"
                  value={pricingMeals}
                  onChange={(e) => setPricingMeals(e.target.value)}
                >
                  <option value="1">1 meal</option>
                  <option value="2">2 meals</option>
                  <option value="3">3 meals</option>
                </select>
              </label>
            </div>
          </section>
          {tab === "Meal planner" ? (
            <section className="weekly-planner">
              <div className="section-heading">
                <div>
                  <h2>Your weekly meal plan</h2>
                  <p>
                    Your plan is saved on this device. Booking a chef is a
                    separate step.
                  </p>
                </div>
                <button
                  className="text-action"
                  onClick={() => setTab("Discover")}
                >
                  Add more meals <Icon name="plus" size={17} />
                </button>
              </div>
              <div className="planner-grid">
                {days.map((d) => (
                  <div className="planner-day" key={d}>
                    <h3>
                      {d}
                      <span>
                        {plan.filter((p) => p.day === d).length} meals
                      </span>
                    </h3>
                    {times.map((t) => {
                      const item = plan.find(
                        (p) => p.day === d && p.mealTime === t
                      )
                      const meal = meals.find((m) => m.id === item?.id)
                      return (
                        <button
                          className={`planner-slot ${meal ? "filled" : ""}`}
                          key={t}
                          onClick={() => {
                            setDay(d)
                            setMealTime(t)
                            if (meal) setSelected(meal)
                            else setTab("Discover")
                          }}
                        >
                          <span>{t}</span>
                          {meal ? (
                            <>
                              <img src={photo(meal.image)} alt="" />
                              <strong>{meal.name}</strong>
                            </>
                          ) : (
                            <small>
                              <Icon name="plus" size={15} /> Add a meal
                            </small>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
              <div className="planner-footer">
                <p>
                  <Icon name="chef" /> Love your plan? Let a personal chef bring
                  it to life.
                </p>
                <Link
                  className="gold-button"
                  to={authenticated ? "/user/confirm" : "/user/signup"}
                >
                  Explore chef subscriptions <Icon name="arrow" size={17} />
                </Link>
              </div>
            </section>
          ) : (
            <>
              <section className="meal-explorer" aria-label="Explore meals">
                <div className="section-heading">
                  <div>
                    <h2>
                      {tab === "Saved meals"
                        ? "Made for your favourites list"
                        : "What’s your craving?"}
                    </h2>
                    <p>
                      {tab === "Saved meals"
                        ? "The meals you love, ready for your next plan."
                        : "A world of flavours. A little something for every day."}
                    </p>
                  </div>
                  <label className="meal-search">
                    <Icon name="search" size={19} />
                    <input
                      aria-label="Search meals or cuisines"
                      placeholder="Search meals, cuisines..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <span>⌕</span>
                  </label>
                </div>
                <div className="filter-row">
                  <div
                    className="category-tabs"
                    role="group"
                    aria-label="Meal categories"
                  >
                    {categories.map((c) => (
                      <button
                        className={category === c.name ? "selected" : ""}
                        aria-pressed={category === c.name}
                        key={c.name}
                        onClick={() => setCategory(c.name)}
                      >
                        {c.icon ? (
                          <Icon name={c.icon} size={20} />
                        ) : (
                          <span>{c.emoji}</span>
                        )}
                        {c.name}
                      </button>
                    ))}
                  </div>
                  <button
                    className={`veg-filter ${vegetarian ? "enabled" : ""}`}
                    onClick={() => setVegetarian(!vegetarian)}
                    aria-pressed={vegetarian}
                  >
                    <span className="veg-symbol">●</span> Veg only{" "}
                    <span className="toggle-track">
                      <i />
                    </span>
                  </button>
                </div>
              </section>
              <section className="meal-results">
                <div className="results-heading">
                  <h2>
                    {tab === "Saved meals"
                      ? "Your saved meals"
                      : "A few favourites to fall for"}{" "}
                    <span>{filtered.length} meals</span>
                  </h2>
                  <label>
                    Sort by:{" "}
                    <select
                      aria-label="Sort meals"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option>Recommended</option>
                      <option>Top rated</option>
                      <option>Quickest first</option>
                    </select>
                  </label>
                </div>
                <div className="meal-grid">
                  {filtered.map((meal) => (
                    <article className="meal-card" key={meal.id}>
                      <div className="meal-image">
                        <button
                          className="meal-image-link"
                          onClick={() => setSelected(meal)}
                          aria-label={`View ${meal.name}`}
                        >
                          <img
                            src={photo(meal.image)}
                            alt={meal.name}
                            loading="lazy"
                          />
                        </button>
                        {meal.tag && (
                          <span className="meal-tag">{meal.tag}</span>
                        )}
                        <button
                          className={`save-meal ${saved.includes(meal.id) ? "saved" : ""}`}
                          aria-label={`${saved.includes(meal.id) ? "Unsave" : "Save"} ${meal.name}`}
                          aria-pressed={saved.includes(meal.id)}
                          onClick={() => toggleSave(meal.id)}
                        >
                          <Icon name="heart" size={18} />
                        </button>
                        <span className="meal-rating">
                          <span>★</span> {meal.rating}
                        </span>
                      </div>
                      <div className="meal-content">
                        <div className="meal-cuisine">
                          <span
                            className={`diet-marker ${!meal.veg ? "non-veg" : ""}`}
                          >
                            ●
                          </span>
                          {meal.cuisine}
                          <span className="meal-calories">
                            {meal.calories} kcal
                          </span>
                        </div>
                        <button
                          className="meal-title"
                          onClick={() => setSelected(meal)}
                        >
                          {meal.name}
                        </button>
                        <p>Fresh ingredients. A whole lot of love.</p>
                        <div className="meal-card-bottom">
                          <div>
                            <strong>
                              {mealQuote
                                ? `From ₹${mealQuote.per_meal_inr}`
                                : "See plans"}
                            </strong>
                            <span> / home / meal</span>
                            <small>
                              <Icon name="clock" size={13} />
                              {meal.time} min prep
                            </small>
                          </div>
                          <button
                            className="add-meal"
                            onClick={() => setSelected(meal)}
                            aria-label={`Add ${meal.name} to plan`}
                          >
                            <Icon name="plus" size={19} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                {filtered.length === 0 && (
                  <div className="discover-empty">
                    <Icon
                      name={tab === "Saved meals" ? "heart" : "search"}
                      size={36}
                    />
                    <h3>
                      {tab === "Saved meals"
                        ? "Your next favourite is waiting"
                        : "No meals found"}
                    </h3>
                    <p>
                      {tab === "Saved meals"
                        ? "Tap the heart on a meal to save it here."
                        : "Try another search or explore a different cuisine."}
                    </p>
                    <button
                      onClick={() => {
                        setQuery("")
                        setCategory("All meals")
                        setVegetarian(false)
                        setTab("Discover")
                      }}
                    >
                      Explore all meals <Icon name="arrow" size={16} />
                    </button>
                  </div>
                )}
              </section>
              <section className="menu-promo">
                <span className="promo-icon">
                  <Icon name="spark" size={27} />
                </span>
                <div>
                  <h3>A meal plan as unique as you.</h3>
                  <p>
                    Your tastes, your goals, your week. Let us put it all
                    together.
                  </p>
                </div>
                <Link to={authenticated ? "/user/ai-menu" : "/user/signup"}>
                  Build my menu <Icon name="arrow" size={17} />
                </Link>
              </section>
            </>
          )}
          <p className="catalogue-note">
            Sample dishes and ratings. Chef service rates depend on household
            size, plan and chef; they are before GST. Your chef will personalise
            your final menu.
          </p>
          <footer className="discover-footer">
            <span>Thoughtfully cooked. Happily shared.</span>
            <span>
              © {new Date().getFullYear()} Chefos{" "}
              <span className="footer-heart">♡</span>
            </span>
          </footer>
        </main>
        <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
          {[
            ["Discover", "home"],
            ["Saved meals", "heart"],
            ["Meal planner", "calendar"]
          ].map(([label, icon]) => (
            <button
              key={label}
              className={tab === label ? "active" : ""}
              onClick={() => changeTab(label)}
            >
              <Icon name={icon} />
              <span>
                {label === "Saved meals"
                  ? "Saved"
                  : label === "Meal planner"
                    ? "My plan"
                    : label}
              </span>
            </button>
          ))}
          <Link to={accountPath}>
            <Icon name="user" />
            <span>Profile</span>
          </Link>
        </nav>
      </div>
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <section
            className="meal-modal"
            role="dialog"
            aria-modal="true"
            aria-label={selected.name}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSelected(null)
            }}
          >
            <button
              autoFocus
              className="modal-close"
              aria-label="Close meal details"
              onClick={() => setSelected(null)}
            >
              <Icon name="close" />
            </button>
            <img src={photo(selected.image)} alt={selected.name} />
            <div className="modal-content">
              <span className="overline">
                {selected.cuisine} · {selected.calories} KCAL · {selected.time}{" "}
                MIN
              </span>
              <h2>{selected.name}</h2>
              <p>{selected.description}</p>
              <div className="plan-selectors">
                <label>
                  Day
                  <select value={day} onChange={(e) => setDay(e.target.value)}>
                    {days.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Meal
                  <select
                    value={mealTime}
                    onChange={(e) => setMealTime(e.target.value)}
                  >
                    {times.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="plan-note">
                Adding a meal replaces any meal in the selected slot. Chef
                service is priced per home and meal, with a final quote for your
                selected chef at checkout.
              </p>
              <button className="gold-button" onClick={() => addMeal(selected)}>
                Add to my plan <Icon name="plus" size={18} />
              </button>
            </div>
          </section>
        </div>
      )}
      {panel && (
        <div
          className="modal-backdrop plan-backdrop"
          onClick={() => setPanel(false)}
        >
          <section
            className="plan-panel"
            role="dialog"
            aria-modal="true"
            aria-label="My meal plan"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setPanel(false)
            }}
          >
            <div className="plan-panel-header">
              <div>
                <span className="overline">YOUR WEEK, SORTED</span>
                <h2>
                  My meal plan <span>({plan.length})</span>
                </h2>
              </div>
              <button
                autoFocus
                className="icon-button"
                aria-label="Close meal plan"
                onClick={() => setPanel(false)}
              >
                <Icon name="close" />
              </button>
            </div>
            <p className="plan-note">
              Saved on this device. No order has been placed.
            </p>
            <div className="plan-items">
              {plan.length === 0 ? (
                <div className="discover-empty">
                  <Icon name="bag" size={38} />
                  <h3>A fresh start for your week</h3>
                  <p>Add a few meals to start planning.</p>
                </div>
              ) : (
                plan.map((item, index) => {
                  const meal = meals.find((m) => m.id === item.id)
                  return (
                    meal && (
                      <div
                        className="plan-item"
                        key={`${item.day}-${item.mealTime}`}
                      >
                        <img src={photo(meal.image)} alt="" />
                        <div>
                          <small>
                            {item.day} · {item.mealTime}
                          </small>
                          <strong>{meal.name}</strong>
                        </div>
                        <button
                          className="icon-button"
                          aria-label={`Remove ${meal.name}`}
                          onClick={() => removeMeal(index)}
                        >
                          <Icon name="close" size={16} />
                        </button>
                      </div>
                    )
                  )
                })
              )}
            </div>
            <button
              className="gold-button"
              onClick={() => {
                changeTab("Meal planner")
                setPanel(false)
              }}
            >
              Open weekly planner <Icon name="arrow" size={18} />
            </button>
          </section>
        </div>
      )}
      {toast && (
        <div className="app-toast" role="status">
          <Icon name="check" size={18} />
          {toast}
        </div>
      )}
    </div>
  )
}
