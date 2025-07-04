import React, { useState, useCallback, useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Card, CardHeader, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Alert, AlertDescription } from '../components/ui/alert';
import {
  Brain,
  Play,
  Upload,
  Download,
  Sparkles,
  Zap,
  Cpu,
  ArrowLeft,

} from 'lucide-react';
import PropertiesPanel from './model-builder/PropertiesPanel';
import ModelCanvas from './model-builder/ModelCanvas';
import CalculationPanel from './model-builder/CalculationPanel';
import ComponentLibrary from './model-builder/ComponentLibrary';
import { ModelComponent, CalculationResult, calculationEngine } from '../utils/calculationEngine';
import { modelBuilderAPI, ModelValidationResult, AIAssistantResponse, ConnectionData, DiscoveryData } from '../services/modelBuilderApi';
import { ModelData } from '../api/types';
import styles from './Step2_ModelBuilder.module.css';

import type { TemplateContext } from './workflow/BusinessCaseWizard';

interface Step2ModelBuilderProps {
  discoveryData: DiscoveryData;
  onNext: (data: DiscoveryData & { modelData: ModelData; quantificationResults?: unknown; localCalculations?: Record<string, CalculationResult>; validationResults?: ModelValidationResult; }) => void;
  modelData?: ModelData;
  quantificationResults?: unknown;
  localCalculations?: Record<string, CalculationResult>;
  validationResults?: ModelValidationResult;
  onBack: () => void;
  templateContext?: TemplateContext;
}

interface ModelBuilderState {
  model: ModelData | null;
  selectedComponent: ModelComponent | null;
  calculations: Record<string, CalculationResult>;

  isGenerating: boolean;
  hasUnsavedChanges: boolean;
  showAIAssistant: boolean;
  validationResult: ModelValidationResult | null;
  exportFormat: 'json' | 'csv' | 'excel' | 'pdf';
  isExporting: boolean;
  aiSuggestions: AIAssistantResponse | null;
  collaborationMode: boolean;
  alert: { type: 'success' | 'warning' | 'error'; message: string } | null;
}

const Step2_ModelBuilder: React.FC<Step2ModelBuilderProps> = ({
  discoveryData,
  onNext,
  onBack,
  modelData: initialModelData,
  localCalculations: initialLocalCalculations,
  validationResults: initialValidationResults
}) => {
    const [isCalculating, setIsCalculating] = useState(false);
  const [state, setState] = useState<ModelBuilderState>({
    model: initialModelData || null,
    selectedComponent: null,
    calculations: initialLocalCalculations || {},

    isGenerating: false,
    hasUnsavedChanges: false,
    showAIAssistant: false,
    validationResult: initialValidationResults || null,
    exportFormat: 'json',
    isExporting: false,
    aiSuggestions: null,
    collaborationMode: false,
    alert: null,
  });

  const setAlert = useCallback((type: 'success' | 'warning' | 'error', message: string) => {
    setState(prev => ({ ...prev, alert: { type, message } }));
    setTimeout(() => setState(prev => ({ ...prev, alert: null })), 5000);
  }, []);

  const performCalculations = useCallback((components: ModelComponent[]): Record<string, CalculationResult> => {
    const results: Record<string, CalculationResult> = {};
    components.forEach(component => {
      calculationEngine.registerComponent(component);
      try {
        const result = calculationEngine.calculateComponent(component.id);
        if (result) {
          results[component.id] = result;
        }
      } catch (error) {
        console.warn(`Calculation failed for component ${component.id}:`, error);
        results[component.id] = {
          value: 0,
          formatted: '$0',
          confidence: 0.5,
          dependencies: []
        };
      }
    });
    return results;
  }, []);

  const getFormattedValue = useCallback((id: string) => {
    const calculation = state.calculations[id];
    if (!calculation) return '$0';
    return calculation.formatted;
  }, [state.calculations]);

  const handleAutoSave = useCallback(async () => {
    if (!state.model) return;
    if (!state.hasUnsavedChanges) return;
    try {
      const updatedModel = await modelBuilderAPI.saveModel(state.model);
      setState(prev => ({ ...prev, model: updatedModel, hasUnsavedChanges: false }));
      setAlert('success', 'Model saved automatically!');
    } catch (error) {
      console.error('Auto-save failed:', error);
      setAlert('error', 'Auto-save failed. Please save manually.');
    }
  }, [state.hasUnsavedChanges, state.model, setAlert]);

  useEffect(() => {
    const interval = setInterval(handleAutoSave, 30000);
    return () => clearInterval(interval);
  }, [handleAutoSave]);

  const handleCalculate = useCallback(async () => {
    if (!state.model) return;
    // No longer needed as isCalculating is a separate state variable
    setIsCalculating(true);
    try {
      const calculatedModel = await modelBuilderAPI.calculateModel(state.model);
      setState(prev => ({
        ...prev,
        model: calculatedModel,
        calculations: performCalculations(calculatedModel.components),
        validationResult: calculatedModel.validationResult || null,
      }));
      setAlert('success', 'Calculations updated!');
    } catch (error) {
      console.error('Calculation failed:', error);
      setAlert('error', 'Calculation failed. Please check your model inputs.');
    } finally {
      setIsCalculating(false);
    }
  }, [state.model, performCalculations, setAlert]);

  const handleExport = useCallback(async () => {
    if (!state.model) {
      setAlert('warning', 'No model to export.');
      return;
    }
    setState(prev => ({ ...prev, isExporting: true }));
    try {
      const data = await modelBuilderAPI.exportModel(state.model, state.exportFormat);
      const blob = new Blob([data], { type: 'application/json' }); // Adjust type based on format
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `model.${state.exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setAlert('success', `Model exported as ${state.exportFormat}!`);
    } catch (error) {
      console.error('Export failed:', error);
      setAlert('error', 'Export failed. Please try again.');
    } finally {
      setState(prev => ({ ...prev, isExporting: false }));
    }
  }, [state.model, state.exportFormat, setAlert]);

  const handleImport = useCallback(async (file: File) => {
    try {
      const importedModelData = await modelBuilderAPI.importModel(file);
      setState(prev => ({
        ...prev,
        model: importedModelData,
        calculations: performCalculations(importedModelData.components),
        hasUnsavedChanges: true,
        selectedComponent: null
      }));
      setAlert('success', 'Model imported successfully!');
    } catch (error) {
      console.error('Import failed:', error);
      setAlert('error', 'Import failed. Please try again.');
    }
  }, [performCalculations, setAlert]);

  const handleAddComponent = useCallback((component: ModelComponent) => {
    setState(prev => {
      const newModel = prev.model ? { ...prev.model } : { components: [], connections: [], name: '', description: '', metadata: { created_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: '1.0.0' } };
      newModel.components = [...newModel.components, component];
      return {
        ...prev,
        model: newModel,
        hasUnsavedChanges: true,
      };
    });
  }, []);

  const handleDeleteComponent = useCallback((componentId: string) => {
    setState(prev => {
      if (!prev.model) return prev;

      const newComponents = prev.model.components.filter(comp => comp.id !== componentId);
      const newConnections = prev.model.connections.filter(conn => conn.source !== componentId && conn.target !== componentId);

      return {
        ...prev,
        model: {
          ...prev.model,
          components: newComponents,
          connections: newConnections,
        },
        selectedComponent: prev.selectedComponent?.id === componentId ? null : prev.selectedComponent,
        hasUnsavedChanges: true,
      };
    });
  }, []);

  const handleUpdateComponent = useCallback((id: string, props: Record<string, unknown>) => {
    setState(prev => {
      if (!prev.model) return prev;

      const updatedComponents = prev.model.components.map(comp =>
        comp.id === id ? { ...comp, properties: { ...comp.properties, ...props } } : comp
      );

      return {
        ...prev,
        model: {
          ...prev.model,
          components: updatedComponents,
        },
        hasUnsavedChanges: true,
      };
    });
  }, []);

  const handleGenerateScenarios = useCallback(async () => {
    if (!state.model) {
      setAlert('warning', 'No model to generate scenarios for.');
      return;
    }
    setState(prev => ({ ...prev, isGenerating: true }));
    try {
      const response = await modelBuilderAPI.generateScenarios(state.model);
      setState(prev => ({
        ...prev,
        model: response, // Assuming response contains updated model with scenarios
        isGenerating: false,
        hasUnsavedChanges: true
      }));
      setAlert('success', 'Scenarios generated successfully!');
    } catch (error) {
      console.error('Scenario generation failed:', error);
      setAlert('error', 'Scenario generation failed. Please try again.');
    } finally {
      setState(prev => ({ ...prev, isGenerating: false }));
    }
  }, [state.model, setAlert]);

  const handleGetAIAssistance = useCallback(async () => {
    if (!state.model) {
      setAlert('warning', 'No model to get AI assistance for.');
      return;
    }
    setState(prev => ({ ...prev, showAIAssistant: true }));
    try {
      const response = await modelBuilderAPI.getAIAssistance({ model_data: state.model, user_query: "Please provide assistance.", context: {} });
      setState(prev => ({ ...prev, aiSuggestions: response }));
      setAlert('success', 'AI assistance received!');
    } catch (error) {
      console.error('AI assistance failed:', error);
      setAlert('error', 'Failed to get AI assistance. Please try again.');
    }
  }, [state.model, setAlert]);

  const handleContinue = useCallback(() => {
    if (!state.model) {
      setAlert('error', 'Cannot continue: Model is empty.');
      return;
    }
    
    const modelData: ModelData = {
      ...state.model,
    };
    
    onNext({
      ...discoveryData,
      modelData,
      localCalculations: state.calculations,
      validationResults: state.validationResult || undefined
    });
  }, [state.model, state.calculations, state.validationResult, discoveryData, onNext, setAlert]);

  return (
    <DndProvider backend={HTML5Backend}>
      <div className={styles.container}>
        <Card className={styles.card}>
          <CardHeader className={styles.header}>
            <div className={styles.headerLeft}>
              <Badge variant="secondary" className={styles.badge}>
                <Brain className={styles.icon} />
                Step 2: Model Builder
              </Badge>
              <h2 className={styles.title}>Build Your Financial Model</h2>
            </div>
            <div className={styles.headerRight}>
              <Button variant="outline" onClick={onBack} aria-label="Go back">
                <ArrowLeft className={styles.icon} /> Back
              </Button>
              <Button variant="default" onClick={handleContinue} disabled={!state.model} aria-label="Continue to Next Step">
                <Play className={styles.icon} /> Continue 
              </Button>
            </div>
          </CardHeader>
          <CardContent className={styles.cardContent}>
            <div className={styles.toolbar}>
              <Button variant="default" onClick={handleCalculate} disabled={isCalculating} aria-label="Calculate Model">
                <Zap className={styles.icon} />
                {isCalculating ? 'Calculating...' : 'Calculate'}
              </Button>
              <Button variant="outline" onClick={handleExport} disabled={state.isExporting} aria-label="Export Model">
                <Download className={styles.icon} /> Export
              </Button>
              <label htmlFor="import-model" className={styles.visuallyHidden}>
                  <input
                    aria-label="Import Model"
                    id="import-model"
                    type="file"
                    accept=".json,.csv,.xlsx,.xls,.pdf"
                    className={styles.hiddenInput}
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) handleImport(e.target.files[0]);
                    }}
                  />
              </label>
              <Button variant="outline" onClick={() => document.getElementById('import-model')?.click()} aria-label="Import Model">
                <Upload className={styles.icon} /> Import
              </Button>
              <Button variant="outline" onClick={handleGenerateScenarios} disabled={state.isGenerating} aria-label="Generate Scenarios">
                <Sparkles className={styles.icon} />
                {state.isGenerating ? 'Generating...' : 'Scenarios'}
              </Button>
              <Button variant="outline" onClick={handleGetAIAssistance} aria-label="AI Assistance">
                <Cpu className={styles.icon} /> AI Assistant
              </Button>
            </div>

            {state.alert && (
              <Alert className={styles.alert} variant={state.alert.type === 'error' ? 'destructive' : 'default'}>
                <AlertDescription>{state.alert.message}</AlertDescription>
              </Alert>
            )}

            <div className={styles.mainContent}>
              <Tabs defaultValue="canvas" className={styles.tabs}>
                <TabsList>
                  <TabsTrigger value="canvas">Model Canvas</TabsTrigger>
                  <TabsTrigger value="properties">Properties</TabsTrigger>
                  <TabsTrigger value="calculations">Calculations</TabsTrigger>
                  <TabsTrigger value="library">Library</TabsTrigger>
                </TabsList>
                <TabsContent value="canvas">
                  <ModelCanvas
                    model={state.model || { components: [], connections: [], name: '', description: '', metadata: { created_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: '1.0.0' } }}
                    selectedComponent={state.selectedComponent}
                    onSelectComponent={(component: ModelComponent | null) => setState(prev => ({ ...prev, selectedComponent: component }))}
                    onModelChange={(modelData: {components: ModelComponent[]; connections: ConnectionData[]}) => {
                      if (!state.model) return;
                      setState(prev => ({
                        ...prev, 
                        model: { 
                          ...prev.model!,
                          components: modelData.components,
                          connections: modelData.connections
                        },
                        hasUnsavedChanges: true 
                      }));
                    }}
                    onAddComponent={handleAddComponent}
                    onDeleteComponent={handleDeleteComponent}
                    readOnly={false}
                    className={styles.canvas}
                  />
                </TabsContent>
                <TabsContent value="properties">
                  <PropertiesPanel
                    selectedComponent={state.selectedComponent}
                    model={state.model || { components: [], connections: [], name: '', description: '', metadata: { created_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: '1.0.0' } }}
                    getFormattedValue={getFormattedValue}
                    onUpdateComponent={handleUpdateComponent}
                  />
                </TabsContent>
                <TabsContent value="calculations">
                  <CalculationPanel
                    model={state.model}
                    calculations={state.calculations}
                    getFormattedValue={getFormattedValue}
                    recalculate={handleCalculate}
                    isCalculating={isCalculating}
                  />
                </TabsContent>
                <TabsContent value="library">
                  <ComponentLibrary
                    onAddComponent={handleAddComponent}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </CardContent>
        </Card>
      </div>
    </DndProvider>
  );
};

export default Step2_ModelBuilder;