// app/page.tsx
'use client';

import { useState, useEffect } from 'react';

interface DataRow {
  title: string;
  submission_date: string;
}

interface PaginationInfo {
  offset: number;
  hasMore: boolean;
}

export default function Home() {
  const [data, setData] = useState<DataRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  const fetchData = async (pageOffset: number, isLoadingMore: boolean = false) => {
    try {
      if (!isLoadingMore) {
        setLoading(true);
      }
      setLoadingMore(isLoadingMore);

      const response = await fetch(`/api/athena?offset=${pageOffset}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      if (isLoadingMore) {
        setData(currentData => [...currentData, ...result.data]);
      } else {
        setData(result.data || []);
      }
      
      setHasMore(result.pagination.hasMore);
      setOffset(pageOffset);
      setLoading(false);
      setLoadingMore(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchData(0);
  }, []);

  const loadMore = () => {
    if (!loadingMore && hasMore) {
      fetchData(offset + 10, true);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  if (loading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4 text-red-500">Error: {error}</div>;
  if (!data.length) return <div className="p-4">No data available</div>;

  return (
    <div className="container mx-auto p-4">
      <main>
        <h1 className="text-2xl font-bold mb-4">GEO Submissions</h1>
        <div className="overflow-x-auto mb-4">
          <table className="min-w-full bg-white border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-6 py-3 border-b border-gray-300 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-3 border-b border-gray-300 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Submission Date
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                >
                  <td className="px-6 py-4 whitespace-normal border-b border-gray-300">
                    {row.title}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap border-b border-gray-300">
                    {formatDate(row.submission_date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {hasMore && (
          <div className="flex justify-center">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-blue-300"
            >
              {loadingMore ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
        
        {!hasMore && data.length > 0 && (
          <div className="text-center text-gray-500 mt-4">
            No more results to load
          </div>
        )}
      </main>
    </div>
  );
}