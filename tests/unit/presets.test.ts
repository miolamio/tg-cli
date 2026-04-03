import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sample api.py content for testing
const SAMPLE_API_PY = `
class APIData(object, metaclass=BaseAPIMetaClass):
    api_id: int = None
    api_hash: str = None

class API:
    class TelegramDesktop(APIData):
        """Official Telegram for Desktop"""
        api_id = 2040
        api_hash = "b18441a1ff607e10a989891a5462e627"
        device_model = "Desktop"

    class TelegramAndroid(APIData):
        """Official Telegram for Android"""
        api_id = 6
        api_hash = "eb06d4abfb49dc3eeb1aeb98ae0f581e"

    class TelegramIOS(APIData):
        """Official Telegram for iOS"""
        api_id = 10840
        api_hash = "33c45224029d59cb3ad0c16134215aeb"

    class TelegramMacOS(APIData):
        """Official Telegram-Swift For MacOS"""
        api_id = 2834
        api_hash = "68875f756c9b437a8b916ca3de215815"

    class TelegramWeb_Z(APIData):
        """Telegram Web Z"""
        api_id = 2496
        api_hash = "8da85b0d5bfe62527e5b244c209159c3"
`;

const SAMPLE_WITH_TEST_KEY = `
class API:
    class TelegramDesktop(APIData):
        api_id = 2040
        api_hash = "b18441a1ff607e10a989891a5462e627"

    class TestClient(APIData):
        api_id = 17349
        api_hash = "344583e45741c457fe1862106095a5eb"
`;

import { parseApiPy, PRESET_NAME_MAP, TEST_API_IDS } from '../../src/lib/presets.js';

describe('parseApiPy', () => {
  it('parses all classes from sample api.py', () => {
    const result = parseApiPy(SAMPLE_API_PY);
    expect(result.size).toBe(5);
    expect(result.get('desktop')).toEqual({ apiId: 2040, apiHash: 'b18441a1ff607e10a989891a5462e627' });
    expect(result.get('android')).toEqual({ apiId: 6, apiHash: 'eb06d4abfb49dc3eeb1aeb98ae0f581e' });
    expect(result.get('ios')).toEqual({ apiId: 10840, apiHash: '33c45224029d59cb3ad0c16134215aeb' });
    expect(result.get('macos')).toEqual({ apiId: 2834, apiHash: '68875f756c9b437a8b916ca3de215815' });
    expect(result.get('web-z')).toEqual({ apiId: 2496, apiHash: '8da85b0d5bfe62527e5b244c209159c3' });
  });

  it('filters out known test api_ids', () => {
    const result = parseApiPy(SAMPLE_WITH_TEST_KEY);
    expect(result.size).toBe(1);
    expect(result.has('desktop')).toBe(true);
    // 17349 should be filtered out
    for (const [, value] of result) {
      expect(TEST_API_IDS).not.toContain(value.apiId);
    }
  });

  it('maps class names to user-friendly preset names', () => {
    expect(PRESET_NAME_MAP.TelegramDesktop).toBe('desktop');
    expect(PRESET_NAME_MAP.TelegramAndroid).toBe('android');
    expect(PRESET_NAME_MAP.TelegramAndroidX).toBe('android-x');
    expect(PRESET_NAME_MAP.TelegramIOS).toBe('ios');
    expect(PRESET_NAME_MAP.TelegramMacOS).toBe('macos');
    expect(PRESET_NAME_MAP.TelegramWeb_Z).toBe('web-z');
    expect(PRESET_NAME_MAP.TelegramWeb_K).toBe('web-k');
    expect(PRESET_NAME_MAP.Webogram).toBe('webogram');
  });

  it('returns empty map for unparseable content', () => {
    const result = parseApiPy('this is not python code');
    expect(result.size).toBe(0);
  });

  it('handles classes not in PRESET_NAME_MAP by lowercasing', () => {
    const content = `
class API:
    class SomeNewClient(APIData):
        api_id = 99999
        api_hash = "abcdef1234567890abcdef1234567890"
    `;
    const result = parseApiPy(content);
    expect(result.has('somenewclient')).toBe(true);
  });
});
