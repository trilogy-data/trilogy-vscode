# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all
import sys
from pathlib import Path
from logging import getLogger

logger = getLogger(__name__)

def get_trilogy_data_files():
    root = sys.modules.get(f'trilogy_public_models')
    root = Path(root.__file__)

    inclusion_files = []
    for key, value in trilogy_public_models.models.items():
    
        path = key.replace('.' , '/')

        check = root.parent / path

        files = check.iterdir()
        for f in files:
            if f.suffix == '.preql':
                subroot = Path('trilogy_public_models') / path
                inclusion_files.append(( str(f), str(subroot)))
    return inclusion_files

def get_trilogy_lark_file():
    root = sys.modules.get(f'trilogy')
    root = Path(root.__file__).parent

    inclusion_files = []
    for f in (root / 'parsing').iterdir():
        if f.suffix == '.lark':
            subroot = Path('trilogy')  / 'parsing'
            inclusion_files.append(( str(f), str(subroot)))
    return inclusion_files

# TODO: evaluate if we want public models by default
datas = get_trilogy_lark_file()
binaries = []
hiddenimports = ['sqlalchemy_bigquery']
tmp_ret = collect_all('duckdb')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('duckdb-engine')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('sqlalchemy')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
block_cipher = None

a = Analysis(
    ['__main__.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='trilogy-language-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='trilogy-language-server',
)
