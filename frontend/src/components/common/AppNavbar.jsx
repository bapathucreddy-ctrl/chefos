import { Link, NavLink, useNavigate } from "react-router-dom"
import Brand from "./Brand"
import {
  ROLE_USER,
  clearRoleSession,
  getRoleUsername
} from "../../services/authSession"

const links = [
  ["Dashboard", "/user/dashboard"],
  ["Menu", "/user/weekly-menu"],
  ["Today", "/user/schedule"],
  ["Chefs", "/user/find-chef"],
  ["History", "/user/history"],
  ["My plan", "/user/confirm"]
]

export default function AppNavbar() {
  const username = getRoleUsername(ROLE_USER)
  const navigate = useNavigate()
  return (
    <header className="app-navbar">
      <div className="page-container app-navbar-inner">
        <Link to="/" aria-label="Chefos home">
          <Brand />
        </Link>
        <nav aria-label="Account navigation">
          {links.map(([label, path]) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="navbar-account">
          <span>Hello, {username || "there"}</span>
          <button
            onClick={() => {
              clearRoleSession(ROLE_USER)
              navigate("/")
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
