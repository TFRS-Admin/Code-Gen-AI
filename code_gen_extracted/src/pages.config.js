import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Assistant from './pages/Assistant';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "Projects": Projects,
    "Assistant": Assistant,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};