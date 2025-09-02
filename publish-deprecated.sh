#!/bin/bash

# Script to publish the deprecated oimdb package

echo "🔍 Testing package build..."
npm run build

echo "📦 Testing package contents..."
npm publish --dry-run

echo "🚀 Publishing deprecated package..."
npm publish

echo "⚠️ Adding deprecation message..."
npm deprecate oimdb@1.3.0 "This package has been split into @oimdb/core and @oimdb/react. Please use the new packages instead."

echo "✅ Deprecated package published successfully!"
echo "📖 Users will see migration instructions when they install or import oimdb"
