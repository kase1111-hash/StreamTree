'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export function Navbar() {
  const { user, logout, loading } = useAuth();

  return (
    <nav className="border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="text-xl font-bold">
            <span className="text-primary-600">Stream</span>
            <span className="text-accent-600">Tree</span>
          </Link>

          <div className="flex items-center gap-4">
            {loading ? (
              <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
            ) : user ? (
              <>
                {user.isStreamer && (
                  <>
                    <Link
                      href="/create"
                      className="text-sm hover:text-primary-600 transition"
                    >
                      Create
                    </Link>
                    <Link
                      href="/episodes"
                      className="text-sm hover:text-primary-600 transition"
                    >
                      My Episodes
                    </Link>
                  </>
                )}
                <Link
                  href="/gallery"
                  className="text-sm hover:text-primary-600 transition"
                >
                  Gallery
                </Link>
                <div className="relative group">
                  <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition">
                    <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
                      {user.displayName?.[0] || user.username[0]}
                    </div>
                    <span className="text-sm">{user.displayName || user.username}</span>
                  </button>
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                    <div className="p-2">
                      <div className="px-3 py-2 text-sm text-gray-500">
                        @{user.username}
                      </div>
                      {!user.isStreamer && (
                        <Link
                          href="/auth/become-streamer"
                          className="block px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                        >
                          Become a Streamer
                        </Link>
                      )}
                      <button
                        onClick={() => logout()}
                        className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <Link
                href="/auth/login"
                className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
