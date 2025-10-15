import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function EmployeeShiftRequest() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-ocean-50 to-blue-50">
      <header className="bg-white shadow-md border-b-4 border-ocean-500">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-gradient-to-br from-ocean-500 to-ocean-700 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-800">シフト希望提出</h1>
                <p className="text-xs text-gray-500">従業員用画面</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link to="/employee/shift" className="btn-secondary text-sm">
                シフト確認
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="card text-center py-12">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">シフト希望提出機能</h2>
          <p className="text-gray-600">この機能は実装中です</p>
        </div>
      </div>
    </div>
  );
}
