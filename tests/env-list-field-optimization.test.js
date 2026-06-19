// Environment list field optimization tests
import { describe, expect, test } from 'vitest';

// Import from dist (built files)
import { simplifyEnvList } from '../mcp/dist/index.js';

describe('Environment List Field Optimization', () => {
  test('should simplify environment list with all fields', () => {
    const fullEnvList = [
      {
        EnvId: 'test-env-1',
        Alias: 'Test Environment',
        Status: 'NORMAL',
        EnvType: 'baas',
        Region: 'ap-shanghai',
        PackageName: '个人版',
        IsDefault: true,
        CreateTime: '2024-01-01 00:00:00',
        UpdateTime: '2024-01-02 00:00:00',
        Databases: [{ InstanceId: 'db-1', Status: 'RUNNING' }],
        Storages: [{ Bucket: 'bucket-1' }],
        Functions: [{ Namespace: 'func-1' }],
        LogServices: [{ LogsetName: 'log-1' }],
        StaticStorages: [{ StaticDomain: 'domain-1' }],
        Tags: [{ Key: 'tag1', Value: 'value1' }],
        Source: 'qcloud',
        PackageId: 'baas_personal',
        PackageType: 'baas',
        EnvStatus: 'NORMAL',
        IsAutoDegrade: false,
        EnvChannel: 'ide',
        PayMode: 'prepayment',
        IsDauPackage: false,
        EnvPreferences: [{ Key: 'Staging', Value: 'on' }],
        CustomLogServices: [],
      },
    ];

    const simplified = simplifyEnvList(fullEnvList);

    expect(simplified).toHaveLength(1);
    expect(simplified[0]).toEqual({
      EnvId: 'test-env-1',
      Alias: 'Test Environment',
      Status: 'NORMAL',
      EnvType: 'baas',
      Region: 'ap-shanghai',
      PackageId: 'baas_personal',
      PackageName: '个人版',
      IsDefault: true,
    });

    // Verify removed fields are not present
    expect(simplified[0]).not.toHaveProperty('CreateTime');
    expect(simplified[0]).not.toHaveProperty('UpdateTime');
    expect(simplified[0]).not.toHaveProperty('Databases');
    expect(simplified[0]).not.toHaveProperty('Storages');
    expect(simplified[0]).not.toHaveProperty('Functions');
    expect(simplified[0]).not.toHaveProperty('LogServices');
    expect(simplified[0]).not.toHaveProperty('StaticStorages');
    expect(simplified[0]).not.toHaveProperty('Tags');
  });

  test('should handle empty array', () => {
    const result = simplifyEnvList([]);
    expect(result).toEqual([]);
  });

  test('should handle null', () => {
    const result = simplifyEnvList(null);
    expect(result).toBe(null);
  });

  test('should handle undefined', () => {
    const result = simplifyEnvList(undefined);
    expect(result).toBe(undefined);
  });

  test('should handle non-array input', () => {
    const result = simplifyEnvList({ not: 'an array' });
    expect(result).toEqual({ not: 'an array' });
  });

  test('should handle missing optional fields', () => {
    const envList = [
      {
        EnvId: 'test-env-1',
        Alias: 'Test',
        // Missing Status, EnvType, etc.
      },
    ];

    const simplified = simplifyEnvList(envList);

    expect(simplified).toHaveLength(1);
    expect(simplified[0]).toEqual({
      EnvId: 'test-env-1',
      Alias: 'Test',
    });
  });

  test('should handle multiple environments', () => {
    const envList = [
      {
        EnvId: 'env-1',
        Alias: 'Environment 1',
        Status: 'NORMAL',
        EnvType: 'baas',
        Region: 'ap-shanghai',
        PackageId: 'baas_personal',
        PackageName: '个人版',
        IsDefault: true,
        Databases: [{ InstanceId: 'db-1' }],
      },
      {
        EnvId: 'env-2',
        Alias: 'Environment 2',
        Status: 'NORMAL',
        EnvType: 'weda',
        Region: 'ap-beijing',
        PackageId: 'baas_free',
        PackageName: '免费版',
        IsDefault: false,
        Databases: [{ InstanceId: 'db-2' }],
      },
    ];

    const simplified = simplifyEnvList(envList);

    expect(simplified).toHaveLength(2);
    expect(simplified[0]).toEqual({
      EnvId: 'env-1',
      Alias: 'Environment 1',
      Status: 'NORMAL',
      EnvType: 'baas',
      Region: 'ap-shanghai',
      PackageId: 'baas_personal',
      PackageName: '个人版',
      IsDefault: true,
    });
    expect(simplified[1]).toEqual({
      EnvId: 'env-2',
      Alias: 'Environment 2',
      Status: 'NORMAL',
      EnvType: 'weda',
      Region: 'ap-beijing',
      PackageId: 'baas_free',
      PackageName: '免费版',
      IsDefault: false,
    });
  });

  test('should preserve undefined values for optional fields', () => {
    const envList = [
      {
        EnvId: 'test-env',
        Alias: 'Test',
        Status: 'NORMAL',
        // EnvType is undefined
        Region: 'ap-shanghai',
        // PackageName is undefined
        IsDefault: false,
      },
    ];

    const simplified = simplifyEnvList(envList);

    expect(simplified[0]).toEqual({
      EnvId: 'test-env',
      Alias: 'Test',
      Status: 'NORMAL',
      Region: 'ap-shanghai',
      IsDefault: false,
    });
    expect(simplified[0]).not.toHaveProperty('EnvType');
    expect(simplified[0]).not.toHaveProperty('PackageName');
  });
});

