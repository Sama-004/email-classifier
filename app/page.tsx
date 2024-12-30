"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [status, setStatus] = useState<string>("");
  const [emails, setEmails] = useState<any[]>([]);
  const fetchEmails = async () => {
    setStatus("Fetching emails...");
    try {
      const response = await fetch("/api/get-new-emails");
      const data = await response.json();
      if (data.success) {
        setStatus(`Successfully processed ${data.emailsProcessed} emails`);
      } else {
        setStatus("Error: " + data.error);
      }
    } catch (error) {
      setStatus("Failed to fetch emails");
    }
  };

  const getSavedEmails = async () => {
    const response = await fetch("/api/emails");
    const data = await response.json();
    console.log(data);
    setEmails(data);
  };

  useEffect(() => {
    getSavedEmails();
  }, []);

  return (
    <div className="p-4">
      <button
        onClick={fetchEmails}
        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded transition-colors">
        Fetch Emails
      </button>
      {status && <p className="mt-4 text-gray-600">{status}</p>}
      <div className="mt-6 grid gap-4">
        {emails.map((email) => (
          <div
            key={email.id}
            className="p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-semibold text-gray-800">
                  {email.subject}
                </h2>
                <p className="text-gray-600 mt-1">From: {email.sender}</p>
              </div>
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                {email.category || "Uncategorized"}
              </span>
            </div>
            <div className="mt-2 text-sm text-gray-500">
              {new Date(email.timestamp * 1000).toLocaleString()}
            </div>
          </div>
        ))}
        {emails.length === 0 && (
          <p className="text-gray-500 text-center py-8">No emails found</p>
        )}
      </div>
    </div>
  );
}
