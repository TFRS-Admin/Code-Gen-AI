import { useLocation } from 'react-router-dom';

export default function PageNotFound() {
    const location = useLocation();
    const pageName = location.pathname.substring(1);

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-tfrs-bg">
            <div className="max-w-md w-full">
                <div className="text-center space-y-6">
                    <div className="space-y-2">
                        <h1 className="text-7xl font-mono font-bold text-tfrs-red">404</h1>
                        <div className="h-0.5 w-16 bg-tfrs-border mx-auto"></div>
                    </div>

                    <div className="space-y-3">
                        <h2 className="text-2xl font-bold text-tfrs-text uppercase tracking-wide">
                            Page Not Found
                        </h2>
                        <p className="text-tfrs-muted leading-relaxed">
                            The page <span className="font-mono text-tfrs-text">"{pageName}"</span> could not be found.
                        </p>
                    </div>

                    <div className="pt-6">
                        <button
                            onClick={() => window.location.href = '/'}
                            className="inline-flex items-center px-4 py-2 text-sm font-mono uppercase text-tfrs-text bg-tfrs-surface border border-tfrs-border hover:border-tfrs-red transition-colors duration-200"
                        >
                            Return to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
