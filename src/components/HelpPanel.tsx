import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  adminHelpContents, 
  employeeHelpContents, 
  commonFaq,
  PageHelp 
} from '../data/helpContents';

interface HelpPanelProps {
  isAdmin?: boolean;
}

export default function HelpPanel({ isAdmin = true }: HelpPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'page' | 'faq'>('page');
  const location = useLocation();
  
  // 現在のページに対応するヘルプコンテンツを取得
  const getPageHelp = (): PageHelp | null => {
    const contents = isAdmin ? adminHelpContents : employeeHelpContents;
    // 完全一致を試す
    if (contents[location.pathname]) {
      return contents[location.pathname];
    }
    // パスの先頭一致を試す（/admin/shifts/123 -> /admin/shifts）
    const basePath = Object.keys(contents).find(path => 
      location.pathname.startsWith(path) && path !== '/admin' && path !== '/employee'
    );
    if (basePath) {
      return contents[basePath];
    }
    // デフォルトのダッシュボード
    return contents[isAdmin ? '/admin' : '/employee/shift'] || null;
  };

  const pageHelp = getPageHelp();

  // ESCキーで閉じる
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  return (
    <>
      {/* ヘルプボタン（常に表示） */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 bg-ocean-600 hover:bg-ocean-700 text-white rounded-full w-14 h-14 shadow-lg flex items-center justify-center transition-all hover:scale-110 no-print"
        title="ヘルプを開く"
      >
        <span className="text-2xl">❓</span>
      </button>

      {/* オーバーレイ */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-30 z-40 no-print"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* ヘルプパネル */}
      <div className={`fixed top-0 right-0 h-full w-full sm:w-96 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out no-print ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {/* ヘッダー */}
        <div className="bg-ocean-600 text-white p-4 flex justify-between items-center">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <span>📖</span>
            ヘルプ
          </h2>
          <button 
            onClick={() => setIsOpen(false)}
            className="text-white hover:bg-ocean-700 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
          >
            ✕
          </button>
        </div>

        {/* タブ */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('page')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'page' 
                ? 'text-ocean-600 border-b-2 border-ocean-600 bg-ocean-50' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            📄 このページの使い方
          </button>
          <button
            onClick={() => setActiveTab('faq')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'faq' 
                ? 'text-ocean-600 border-b-2 border-ocean-600 bg-ocean-50' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            💬 よくある質問
          </button>
        </div>

        {/* コンテンツ */}
        <div className="overflow-y-auto h-[calc(100%-120px)] p-4">
          {activeTab === 'page' && pageHelp && (
            <div className="space-y-6">
              {/* ページタイトル */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-bold text-gray-800">{pageHelp.pageTitle}</h3>
                <p className="text-sm text-gray-600 mt-1">{pageHelp.pageDescription}</p>
              </div>

              {/* セクション */}
              {pageHelp.sections.map((section, index) => (
                <div key={index} className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-4 py-2 font-medium text-gray-800 flex items-center gap-2">
                    <span>{section.icon}</span>
                    {section.title}
                  </div>
                  <div className="p-4 space-y-2">
                    <ul className="space-y-2">
                      {section.content.map((item, i) => (
                        <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                          <span className="text-ocean-500 mt-1">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    {section.tips && section.tips.length > 0 && (
                      <div className="mt-3 bg-yellow-50 rounded p-3 space-y-1">
                        {section.tips.map((tip, i) => (
                          <p key={i} className="text-xs text-yellow-800">{tip}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* ページ固有のFAQ */}
              {pageHelp.faq && pageHelp.faq.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-4 py-2 font-medium text-gray-800 flex items-center gap-2">
                    <span>❓</span>
                    このページのよくある質問
                  </div>
                  <div className="p-4 space-y-3">
                    {pageHelp.faq.map((item, i) => (
                      <div key={i} className="border-b pb-3 last:border-b-0 last:pb-0">
                        <p className="text-sm font-medium text-gray-800">Q: {item.question}</p>
                        <p className="text-sm text-gray-600 mt-1">A: {item.answer}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'faq' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 mb-4">システム全般に関するよくある質問です</p>
              
              {/* 共通FAQ */}
              {commonFaq.map((item, i) => (
                <div key={i} className="border rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-800 flex items-start gap-2">
                    <span className="text-ocean-600">Q:</span>
                    {item.question}
                  </p>
                  <p className="text-sm text-gray-600 mt-2 flex items-start gap-2">
                    <span className="text-green-600">A:</span>
                    {item.answer}
                  </p>
                </div>
              ))}

              {/* ページ固有のFAQ（あれば追加表示） */}
              {pageHelp?.faq && pageHelp.faq.length > 0 && (
                <>
                  <div className="border-t pt-4 mt-4">
                    <p className="text-sm font-medium text-gray-700 mb-3">
                      📄 {pageHelp.pageTitle}に関する質問
                    </p>
                    {pageHelp.faq.map((item, i) => (
                      <div key={i} className="border rounded-lg p-4 mb-3">
                        <p className="text-sm font-medium text-gray-800 flex items-start gap-2">
                          <span className="text-ocean-600">Q:</span>
                          {item.question}
                        </p>
                        <p className="text-sm text-gray-600 mt-2 flex items-start gap-2">
                          <span className="text-green-600">A:</span>
                          {item.answer}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'page' && !pageHelp && (
            <div className="text-center py-8 text-gray-500">
              <p>このページのヘルプはまだ準備中です</p>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="absolute bottom-0 left-0 right-0 bg-gray-50 border-t p-3 text-center">
          <p className="text-xs text-gray-500">
            キーボードの「ESC」キーで閉じることができます
          </p>
        </div>
      </div>
    </>
  );
}
