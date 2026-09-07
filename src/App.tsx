import { lazy, Suspense } from "react";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import FacebookPixelProvider from "./components/FacebookPixelProvider";
import Index from "./pages/Index";

// Lazy load all non-homepage routes
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Packages = lazy(() => import("./pages/Packages"));
const PackageDetail = lazy(() => import("./pages/PackageDetail"));
const Hotels = lazy(() => import("./pages/Hotels"));
const HotelDetail = lazy(() => import("./pages/HotelDetail"));
const Booking = lazy(() => import("./pages/Booking"));
const TrackBooking = lazy(() => import("./pages/TrackBooking"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const NotFound = lazy(() => import("./pages/NotFound"));
const InvoicePage = lazy(() => import("./pages/InvoicePage"));
const VerifyInvoice = lazy(() => import("./pages/VerifyInvoice"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsConditions = lazy(() => import("./pages/TermsConditions"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));

// Lazy load admin pages (heavy: recharts, xlsx, jspdf)
const AdminLayout = lazy(() => import("./components/admin/AdminLayout"));
const AdminDashboardPage = lazy(() => import("./pages/admin/AdminDashboardPage"));
const AdminBookingsPage = lazy(() => import("./pages/admin/AdminBookingsPage"));
const AdminCustomersPage = lazy(() => import("./pages/admin/AdminCustomersPage"));
const AdminPackagesPage = lazy(() => import("./pages/admin/AdminPackagesPage"));
const AdminPaymentsPage = lazy(() => import("./pages/admin/AdminPaymentsPage"));
const AdminAccountingPage = lazy(() => import("./pages/admin/AdminAccountingPage"));
const AdminReportsPage = lazy(() => import("./pages/admin/AdminReportsPage"));
const AdminCmsPage = lazy(() => import("./pages/admin/AdminCmsPage"));
const AdminSettingsPage = lazy(() => import("./pages/admin/AdminSettingsPage"));
const AdminCreateBookingPage = lazy(() => import("./pages/admin/AdminCreateBookingPage"));
const AdminMoallemsPage = lazy(() => import("./pages/admin/AdminMoallemsPage"));
const AdminMoallemProfilePage = lazy(() => import("./pages/admin/AdminMoallemProfilePage"));
const AdminSupplierAgentsPage = lazy(() => import("./pages/admin/AdminSupplierAgentsPage"));
const AdminSupplierAgentProfilePage = lazy(() => import("./pages/admin/AdminSupplierAgentProfilePage"));
const AdminCalculatorPage = lazy(() => import("./pages/admin/AdminCalculatorPage"));
const AdminHotelsPage = lazy(() => import("./pages/admin/AdminHotelsPage"));
const AdminNotificationsPage = lazy(() => import("./pages/admin/AdminNotificationsPage"));
const AdminDueAlertsPage = lazy(() => import("./pages/admin/AdminDueAlertsPage"));
const AdminChartOfAccountsPage = lazy(() => import("./pages/admin/AdminChartOfAccountsPage"));
const AdminReceivablesPage = lazy(() => import("./pages/admin/AdminReceivablesPage"));
const AdminRefundsPage = lazy(() => import("./pages/admin/AdminRefundsPage"));
const AdminAnalyticsPage = lazy(() => import("./pages/admin/AdminAnalyticsPage"));
const AdminSeoPage = lazy(() => import("./pages/admin/AdminSeoPage"));
const AdminPaymentMethodsPage = lazy(() => import("./pages/admin/AdminPaymentMethodsPage"));
const AdminInvoicesPage = lazy(() => import("./pages/admin/AdminInvoicesPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const App = () => (
  <HelmetProvider>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <FacebookPixelProvider />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/packages" element={<Packages />} />
            <Route path="/packages/:id" element={<PackageDetail />} />
            <Route path="/hotels" element={<Hotels />} />
            <Route path="/hotels/:id" element={<HotelDetail />} />
            <Route path="/booking" element={<Booking />} />
            <Route path="/track" element={<TrackBooking />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/invoice" element={<InvoicePage />} />
            <Route path="/verify/:invoiceNumber" element={<VerifyInvoice />} />
            <Route path="/verify" element={<VerifyInvoice />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-conditions" element={<TermsConditions />} />
            <Route path="/refund-policy" element={<RefundPolicy />} />

            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="bookings" element={<AdminBookingsPage />} />
              <Route path="bookings/create" element={<AdminCreateBookingPage />} />
              <Route path="customers" element={<AdminCustomersPage />} />
              <Route path="packages" element={<AdminPackagesPage />} />
              <Route path="payments" element={<AdminPaymentsPage />} />
              <Route path="invoices" element={<AdminInvoicesPage />} />
              <Route path="accounting" element={<AdminAccountingPage />} />
              <Route path="reports" element={<AdminReportsPage />} />
              <Route path="moallems" element={<AdminMoallemsPage />} />
              <Route path="moallems/:id" element={<AdminMoallemProfilePage />} />
              <Route path="supplier-agents" element={<AdminSupplierAgentsPage />} />
              <Route path="supplier-agents/:id" element={<AdminSupplierAgentProfilePage />} />
              <Route path="calculator" element={<AdminCalculatorPage />} />
              <Route path="hotels" element={<AdminHotelsPage />} />
              <Route path="notifications" element={<AdminNotificationsPage />} />
              <Route path="due-alerts" element={<AdminDueAlertsPage />} />
              <Route path="chart-of-accounts" element={<AdminChartOfAccountsPage />} />
              <Route path="receivables" element={<AdminReceivablesPage />} />
              <Route path="refunds" element={<AdminRefundsPage />} />
              <Route path="analytics" element={<AdminAnalyticsPage />} />
              <Route path="cms" element={<AdminCmsPage />} />
              <Route path="seo" element={<AdminSeoPage />} />
              <Route path="payment-methods" element={<AdminPaymentMethodsPage />} />
              <Route path="settings" element={<AdminSettingsPage />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </HelmetProvider>
);

export default App;
