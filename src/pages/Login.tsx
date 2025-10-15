import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface LoginProps {
  onLogin: (password: string) => Promise<boolean>;
}

export default function Login({ onLogin }: LoginProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const success = await onLogin(password);
    
    if (success) {
      navigate('/admin');
    } else {
      setError('パスワードが正しくありません');
      setPassword('');
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-ocean-50 via-ocean-100 to-blue-100">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-96 h-96 bg-ocean-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-fish-orange rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse delay-1000"></div>
      </div>

      <div className="card max-w-md w-full mx-4 relative z-10 shadow-2xl">
        <div className="text-center mb-8">
          <div className="inline-block p-4 bg-ocean-100 rounded-full mb-4">
            <svg className="w-16 h-16 text-ocean-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">シフト管理システム</h1>
          <p className="text-gray-600">管理者ログイン</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              パスワード
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="パスワードを入力"
              required
              autoFocus
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary py-3 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="text-xs text-gray-500 space-y-1">
            <p>💡 初期パスワード</p>
            <p className="ml-4">• 本部管理者: <code className="bg-gray-100 px-2 py-1 rounded">admin</code></p>
            <p className="ml-4">• 店舗責任者: <code className="bg-gray-100 px-2 py-1 rounded">store1</code> ~ <code className="bg-gray-100 px-2 py-1 rounded">store7</code></p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate('/employee/shift')}
            className="text-ocean-600 hover:text-ocean-700 text-sm underline"
          >
            従業員用ページへ戻る
          </button>
        </div>
      </div>
    </div>
  );
}
