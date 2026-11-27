import { PluginPageView } from "@infinite-canvas/workbench/components/plugins/plugin-contributions";
import { createBrowserRouter, createHashRouter, Navigate, Outlet } from "react-router-dom";

import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import UserLayout from "@infinite-canvas/workbench/layouts/user-layout";
import AssetsPage from "@infinite-canvas/workbench/pages/assets";
import CanvasPage from "@infinite-canvas/workbench/pages/canvas";
import CanvasProjectPage from "@infinite-canvas/workbench/pages/canvas/project";
import CreatePage from "@infinite-canvas/workbench/pages/create";
import CreateHistoryPage from "@infinite-canvas/workbench/pages/create/history";
import HomePage from "@infinite-canvas/workbench/pages/home";
import NotFound from "@infinite-canvas/workbench/pages/not-found";
import PromptsPage from "@infinite-canvas/workbench/pages/prompts";

const mobilePreview = import.meta.env.MODE === "mobile-preview";
const createRouter = mobilePreview ? createHashRouter : createBrowserRouter;

export const router = createRouter([
    {
        element: (
            <UserLayout>
                {!mobilePreview && <AnalyticsTracker />}
                <Outlet />
            </UserLayout>
        ),
        children: [
            { path: "/", element: mobilePreview ? <Navigate replace to="/canvas" /> : <HomePage /> },
            ...(!mobilePreview ? [
                { path: "/extensions/:pageId", element: <PluginPageView /> },
                { path: "/create/history", element: <CreateHistoryPage /> },
                { path: "/create", element: <CreatePage /> },
                { path: "/prompts", element: <PromptsPage /> },
            ] : []),
            { path: "/assets", element: <AssetsPage /> },
            { path: "/canvas", element: <CanvasPage /> },
            { path: "/canvas/:id", element: <CanvasProjectPage /> },
            { path: "*", element: <NotFound /> },
        ],
    },
]);
