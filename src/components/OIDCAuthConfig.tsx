'use client';

import {
  AlertCircle,
  CheckCircle2,
  Edit2,
  Globe,
  KeyRound,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface OIDCProvider {
  id: string;
  name: string;
  enabled: boolean;
  enableRegistration: boolean;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  jwksUri?: string; // JWKS endpoint for JWT signature verification (optional)
  clientId: string;
  clientSecret: string;
  buttonText: string;
  minTrustLevel: number;
}

interface OIDCAuthConfigProps {
  providers: OIDCProvider[];
  onSave: (providers: OIDCProvider[]) => Promise<void>;
}

export function OIDCAuthConfig({ providers, onSave }: OIDCAuthConfigProps) {
  const [localProviders, setLocalProviders] =
    useState<OIDCProvider[]>(providers);
  const [editingProvider, setEditingProvider] = useState<OIDCProvider | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setLocalProviders(providers);
  }, [providers]);

  useEffect(() => {
    const changed =
      JSON.stringify(localProviders) !== JSON.stringify(providers);
    setHasChanges(changed);
  }, [localProviders, providers]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await onSave(localProviders);
      setMessage({ type: 'success', text: '保存成功' });
      setHasChanges(false);
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({
        type: 'error',
        text: `保存失败: ${(error as Error).message}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddProvider = () => {
    const newProvider: OIDCProvider = {
      id: `provider-${Date.now()}`,
      name: '新 Provider',
      enabled: false,
      enableRegistration: false,
      issuer: '',
      authorizationEndpoint: '',
      tokenEndpoint: '',
      userInfoEndpoint: '',
      clientId: '',
      clientSecret: '',
      buttonText: '',
      minTrustLevel: 0,
    };
    setEditingProvider(newProvider);
  };

  const handleSaveProvider = (provider: OIDCProvider) => {
    const existingIndex = localProviders.findIndex((p) => p.id === provider.id);
    if (existingIndex >= 0) {
      const updated = [...localProviders];
      updated[existingIndex] = provider;
      setLocalProviders(updated);
    } else {
      setLocalProviders([...localProviders, provider]);
    }
    setEditingProvider(null);
    setHasChanges(true);
  };

  const handleDeleteProvider = (id: string) => {
    if (confirm('确定要删除这个 Provider 吗？')) {
      setLocalProviders(localProviders.filter((p) => p.id !== id));
      setHasChanges(true);
    }
  };

  return (
    <div className='space-y-6'>
      {/* 标题和说明 */}
      <div className='border-b border-gray-200 dark:border-gray-700 pb-4'>
        <h2 className='text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2'>
          <KeyRound className='w-5 h-5 text-purple-500' />
          OIDC 登录配置
        </h2>
        <p className='mt-2 text-sm text-gray-600 dark:text-gray-400'>
          配置 OpenID Connect 登录，支持
          Google、Microsoft、GitHub、Facebook、微信、Apple、LinuxDo 等提供商
        </p>
      </div>

      {/* Provider 列表 */}
      <div className='space-y-3'>
        {localProviders.map((provider) => (
          <div
            key={provider.id}
            className='flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700'
          >
            <div className='flex-1 min-w-0'>
              <div className='flex items-center gap-2 flex-wrap'>
                <h3 className='font-medium text-gray-900 dark:text-gray-100 text-sm sm:text-base'>
                  {provider.name}
                </h3>
                <span
                  className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${
                    provider.enabled
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {provider.enabled ? '已启用' : '已禁用'}
                </span>
              </div>
              <p className='text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 truncate'>
                ID: {provider.id} | {provider.issuer || '未配置 Issuer'}
              </p>
            </div>
            <div className='flex gap-2 self-end sm:self-auto'>
              <button
                onClick={() => setEditingProvider(provider)}
                className='p-2 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors'
                title='编辑'
              >
                <Edit2 className='w-4 h-4' />
              </button>
              <button
                onClick={() => handleDeleteProvider(provider.id)}
                className='p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors'
                title='删除'
              >
                <Trash2 className='w-4 h-4' />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 添加 Provider 按钮 */}
      <button
        onClick={handleAddProvider}
        className='w-full py-2.5 sm:py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm sm:text-base text-gray-600 dark:text-gray-400 hover:border-purple-500 dark:hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors flex items-center justify-center gap-2 font-medium'
      >
        <Plus className='w-4 h-4 sm:w-5 sm:h-5' />
        添加新 Provider
      </button>

      {/* 消息提示 */}
      {message && (
        <div
          className={`flex items-center gap-2 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800'
              : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className='w-5 h-5 text-primary-600 dark:text-primary-400' />
          ) : (
            <AlertCircle className='w-5 h-5 text-red-600 dark:text-red-400' />
          )}
          <span
            className={`text-sm ${
              message.type === 'success'
                ? 'text-primary-800 dark:text-primary-200'
                : 'text-red-800 dark:text-red-200'
            }`}
          >
            {message.text}
          </span>
        </div>
      )}

      {/* 保存按钮 */}
      <div className='flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700'>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className='px-6 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2'
        >
          <Save className='w-4 h-4' />
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>

      {/* Provider 编辑模态框 */}
      {editingProvider && (
        <ProviderEditModal
          provider={editingProvider}
          onSave={handleSaveProvider}
          onCancel={() => setEditingProvider(null)}
        />
      )}
    </div>
  );
}

// Provider 编辑模态框组件
function ProviderEditModal({
  provider,
  onSave,
  onCancel,
}: {
  provider: OIDCProvider;
  onSave: (provider: OIDCProvider) => void;
  onCancel: () => void;
}) {
  const [localProvider, setLocalProvider] = useState(provider);
  const [discovering, setDiscovering] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleDiscover = async () => {
    if (!localProvider.issuer) {
      setMessage({ type: 'error', text: '请先输入 Issuer URL' });
      return;
    }

    setDiscovering(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/oidc-discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issuerUrl: localProvider.issuer }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '自动发现失败');
      }

      const data = await response.json();
      setLocalProvider({
        ...localProvider,
        authorizationEndpoint: data.authorization_endpoint || '',
        tokenEndpoint: data.token_endpoint || '',
        userInfoEndpoint: data.userinfo_endpoint || '',
        jwksUri: data.jwks_uri || '',
      });
      setMessage({ type: 'success', text: '自动发现成功' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({
        type: 'error',
        text: `自动发现失败: ${(error as Error).message}`,
      });
    } finally {
      setDiscovering(false);
    }
  };

  return (
    <div className='fixed inset-0 z-50 overflow-y-auto'>
      <div className='flex items-end md:items-center justify-center min-h-screen md:min-h-full p-0 md:p-4'>
        {/* 背景遮罩 */}
        <div
          className='fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity'
          onClick={onCancel}
        />

        {/* 模态框内容 */}
        <div className='relative bg-white dark:bg-gray-800 rounded-t-2xl md:rounded-xl shadow-2xl w-full md:w-auto md:min-w-[600px] md:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden'>
          {/* Header - Fixed */}
          <div className='flex items-center justify-between p-4 md:p-6 border-b border-gray-200 dark:border-gray-700 shrink-0'>
            <h3 className='text-lg md:text-xl font-semibold text-gray-900 dark:text-gray-100'>
              {provider.name === '新 Provider'
                ? '添加 Provider'
                : '编辑 Provider'}
            </h3>
            <button
              onClick={onCancel}
              className='p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors'
              aria-label='关闭'
            >
              <svg
                className='w-5 h-5 text-gray-500 dark:text-gray-400'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M6 18L18 6M6 6l12 12'
                />
              </svg>
            </button>
          </div>

          {/* Body - Scrollable */}
          <div className='overflow-y-auto flex-1 p-4 md:p-6'>
            <div className='space-y-4'>
              {/* Provider ID */}
              <div>
                <label className='block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2'>
                  Provider ID *
                </label>
                <input
                  type='text'
                  value={localProvider.id}
                  onChange={(e) =>
                    setLocalProvider({ ...localProvider, id: e.target.value })
                  }
                  className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent'
                  placeholder='google, github, linuxdo, custom, etc.'
                />
                <div className='mt-1 text-xs text-gray-500 dark:text-gray-400 space-y-2'>
                  <div className='bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-2'>
                    <p className='font-semibold text-yellow-800 dark:text-yellow-200'>
                      ⚠️ ID 规则说明：
                    </p>
                  </div>
                  <div>
                    <strong>
                      已知提供商（显示专属logo）- 必须使用以下固定ID：
                    </strong>
                    <br />• Google:{' '}
                    <code className='px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded'>
                      google
                    </code>
                    <br />• GitHub:{' '}
                    <code className='px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded'>
                      github
                    </code>
                    <br />• Microsoft:{' '}
                    <code className='px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded'>
                      microsoft
                    </code>
                    <br />• Facebook:{' '}
                    <code className='px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded'>
                      facebook
                    </code>
                    <br />• 微信:{' '}
                    <code className='px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded'>
                      wechat
                    </code>
                    <br />• Apple:{' '}
                    <code className='px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded'>
                      apple
                    </code>
                    <br />• LinuxDo:{' '}
                    <code className='px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded'>
                      linuxdo
                    </code>
                  </div>
                  <div>
                    <strong>自定义OIDC提供商（显示通用图标）：</strong>
                    <br />• 每个提供商必须有<strong>唯一的ID</strong>
                    <br />• 示例:{' '}
                    <code className='px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded'>
                      authing
                    </code>
                    ,{' '}
                    <code className='px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded'>
                      keycloak-1
                    </code>
                    ,{' '}
                    <code className='px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded'>
                      keycloak-2
                    </code>
                    <br />• 如果有多个Keycloak等，每个都要不同的ID
                  </div>
                </div>
              </div>

              {/* Provider Name */}
              <div>
                <label className='block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2'>
                  显示名称 *
                </label>
                <input
                  type='text'
                  value={localProvider.name}
                  onChange={(e) =>
                    setLocalProvider({ ...localProvider, name: e.target.value })
                  }
                  className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent'
                  placeholder='Google'
                />
              </div>

              {/* Enabled Toggle */}
              <div className='flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg'>
                <div>
                  <label className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                    启用此 Provider
                  </label>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                    开启后，登录页面将显示此 Provider
                  </p>
                </div>
                <button
                  type='button'
                  onClick={() =>
                    setLocalProvider({
                      ...localProvider,
                      enabled: !localProvider.enabled,
                    })
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                    localProvider.enabled
                      ? 'bg-purple-600'
                      : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      localProvider.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Enable Registration Toggle */}
              <div className='flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg'>
                <div>
                  <label className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                    允许注册
                  </label>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                    允许通过此 Provider 自动注册新用户
                  </p>
                </div>
                <button
                  type='button'
                  onClick={() =>
                    setLocalProvider({
                      ...localProvider,
                      enableRegistration: !localProvider.enableRegistration,
                    })
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                    localProvider.enableRegistration
                      ? 'bg-purple-600'
                      : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      localProvider.enableRegistration
                        ? 'translate-x-5'
                        : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Issuer */}
              <div>
                <label className='block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2'>
                  Issuer URL（可选）
                </label>
                <div className='flex flex-col sm:flex-row gap-2'>
                  <input
                    type='text'
                    value={localProvider.issuer}
                    onChange={(e) =>
                      setLocalProvider({
                        ...localProvider,
                        issuer: e.target.value,
                      })
                    }
                    className='flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent'
                    placeholder='https://accounts.google.com'
                  />
                  <button
                    type='button'
                    onClick={handleDiscover}
                    disabled={discovering || !localProvider.issuer}
                    className='px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 whitespace-nowrap'
                  >
                    <Globe className='w-4 h-4' />
                    <span className='hidden sm:inline'>
                      {discovering ? '发现中...' : '自动发现'}
                    </span>
                    <span className='sm:hidden'>
                      {discovering ? '发现中' : '发现'}
                    </span>
                  </button>
                </div>
                <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
                  填写后可点击"自动发现"按钮自动获取端点配置
                </p>
              </div>

              {/* Authorization Endpoint */}
              <div>
                <label className='block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2'>
                  Authorization Endpoint *
                </label>
                <input
                  type='text'
                  value={localProvider.authorizationEndpoint}
                  onChange={(e) =>
                    setLocalProvider({
                      ...localProvider,
                      authorizationEndpoint: e.target.value,
                    })
                  }
                  className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent'
                  placeholder='https://accounts.google.com/o/oauth2/v2/auth'
                />
              </div>

              {/* Token Endpoint */}
              <div>
                <label className='block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2'>
                  Token Endpoint *
                </label>
                <input
                  type='text'
                  value={localProvider.tokenEndpoint}
                  onChange={(e) =>
                    setLocalProvider({
                      ...localProvider,
                      tokenEndpoint: e.target.value,
                    })
                  }
                  className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent'
                  placeholder='https://oauth2.googleapis.com/token'
                />
              </div>

              {/* UserInfo Endpoint - 除了 Apple 外的其他 provider 需要 */}
              {localProvider.id.toLowerCase() !== 'apple' && (
                <div>
                  <label className='block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2'>
                    UserInfo Endpoint *
                  </label>
                  <input
                    type='text'
                    value={localProvider.userInfoEndpoint}
                    onChange={(e) =>
                      setLocalProvider({
                        ...localProvider,
                        userInfoEndpoint: e.target.value,
                      })
                    }
                    className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent'
                    placeholder='https://openidconnect.googleapis.com/v1/userinfo'
                  />
                </div>
              )}

              {/* JWKS URI - 只有 Apple 需要 */}
              {localProvider.id.toLowerCase() === 'apple' && (
                <div>
                  <label className='block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2'>
                    JWKS URI *
                  </label>
                  <input
                    type='text'
                    value={localProvider.jwksUri || ''}
                    onChange={(e) =>
                      setLocalProvider({
                        ...localProvider,
                        jwksUri: e.target.value,
                      })
                    }
                    className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent'
                    placeholder='https://appleid.apple.com/auth/keys'
                  />
                  <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
                    用于验证 Apple id_token 签名的公钥端点
                  </p>
                </div>
              )}

              {/* Client ID */}
              <div>
                <label className='block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2'>
                  Client ID *
                </label>
                <input
                  type='text'
                  value={localProvider.clientId}
                  onChange={(e) =>
                    setLocalProvider({
                      ...localProvider,
                      clientId: e.target.value,
                    })
                  }
                  className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent'
                  placeholder='your-client-id.apps.googleusercontent.com'
                />
              </div>

              {/* Client Secret */}
              <div>
                <label className='block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2'>
                  Client Secret *
                </label>
                <input
                  type='password'
                  value={localProvider.clientSecret}
                  onChange={(e) =>
                    setLocalProvider({
                      ...localProvider,
                      clientSecret: e.target.value,
                    })
                  }
                  className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent'
                  placeholder='••••••••••••••••'
                />
              </div>

              {/* Redirect URI 显示 - 新增 */}
              <div>
                <label className='block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2'>
                  Redirect URI（回调地址）
                </label>
                <div className='relative'>
                  <input
                    type='text'
                    readOnly
                    value={
                      typeof window !== 'undefined'
                        ? `${window.location.origin}/api/auth/oidc/callback`
                        : ''
                    }
                    className='w-full px-3 py-2 pr-16 sm:pr-20 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 text-xs sm:text-sm cursor-default'
                  />
                  <button
                    type='button'
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        navigator.clipboard.writeText(
                          `${window.location.origin}/api/auth/oidc/callback`,
                        );
                        setMessage({ type: 'success', text: '已复制到剪贴板' });
                        setTimeout(() => setMessage(null), 2000);
                      }
                    }}
                    className='absolute right-2 top-1/2 -translate-y-1/2 px-2 sm:px-3 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors'
                  >
                    复制
                  </button>
                </div>
                <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
                  请在 OIDC 提供商的应用配置中添加此地址作为允许的重定向 URI
                </p>
              </div>

              {/* Button Text */}
              <div>
                <label className='block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2'>
                  登录按钮文字
                </label>
                <input
                  type='text'
                  value={localProvider.buttonText}
                  onChange={(e) =>
                    setLocalProvider({
                      ...localProvider,
                      buttonText: e.target.value,
                    })
                  }
                  className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent'
                  placeholder='使用 Google 登录'
                />
                <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
                  自定义登录按钮显示的文字，留空则根据提供商自动识别
                </p>
              </div>

              {/* Min Trust Level */}
              <div>
                <label className='block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2'>
                  最低信任等级（LinuxDo 专用）
                </label>
                <input
                  type='number'
                  min='0'
                  value={localProvider.minTrustLevel}
                  onChange={(e) =>
                    setLocalProvider({
                      ...localProvider,
                      minTrustLevel: parseInt(e.target.value) || 0,
                    })
                  }
                  className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent'
                  placeholder='0'
                />
                <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
                  仅对 LinuxDo 有效，0 表示不限制。其他提供商请保持为 0
                </p>
              </div>

              {/* Message */}
              {message && (
                <div
                  className={`flex items-center gap-2 p-4 rounded-lg ${
                    message.type === 'success'
                      ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800'
                      : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                  }`}
                >
                  {message.type === 'success' ? (
                    <CheckCircle2 className='w-5 h-5 text-primary-600 dark:text-primary-400' />
                  ) : (
                    <AlertCircle className='w-5 h-5 text-red-600 dark:text-red-400' />
                  )}
                  <span
                    className={`text-sm ${
                      message.type === 'success'
                        ? 'text-primary-800 dark:text-primary-200'
                        : 'text-red-800 dark:text-red-200'
                    }`}
                  >
                    {message.text}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Footer - Fixed */}
          <div className='flex gap-3 p-4 md:p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 shrink-0'>
            <button
              onClick={onCancel}
              className='flex-1 px-4 md:px-6 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-lg font-medium transition-colors'
            >
              取消
            </button>
            <button
              onClick={() => onSave(localProvider)}
              className='flex-1 px-4 md:px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2'
            >
              <Save className='w-4 h-4' />
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
