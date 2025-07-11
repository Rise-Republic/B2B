import { ModelData, SaveModelResponse, ListModelsResponse, ApiError, QuantifyRoiRequest, QuantifyRoiResponse, ExportModelRequest, ExportModelResponse } from './types';

const API_BASE_URL = '/api/models';

/**
 * Fetches a model by ID
 */
export const getModel = async (modelId: string): Promise<ModelData> => {
  const response = await fetch(`${API_BASE_URL}/${modelId}`);
  
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      message: 'Failed to fetch model',
    }));
    error.status = response.status;
    throw error;
  }
  
  return response.json();
};

/**
 * Saves a model
 */
export const saveModel = async (model: ModelData): Promise<SaveModelResponse> => {
  const method = model.id ? 'PUT' : 'POST';
  const url = model.id ? `${API_BASE_URL}/${model.id}` : API_BASE_URL;
  
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(model),
  });
  
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      message: `Failed to ${model.id ? 'update' : 'create'} model`,
    }));
    error.status = response.status;
    throw error;
  }
  
  return response.json();
};

/**
 * Lists all available models
 */
export const listModels = async (): Promise<ListModelsResponse> => {
  const response = await fetch(API_BASE_URL);
  
  if (!response.ok) {
    const error: ApiError = {
      message: 'Failed to fetch models',
      status: response.status,
    };
    throw error;
  }
  
  return response.json();
};

/**
 * Deletes a model by ID
 */
export const deleteModel = async (modelId: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/${modelId}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      message: 'Failed to delete model',
    }));
    error.status = response.status;
    throw error;
  }
};

/**
 * Calculates ROI and performs sensitivity analysis for a given model.
 */
export const calculateModel = async (request: QuantifyRoiRequest): Promise<QuantifyRoiResponse> => {
  const response = await fetch('/api/quantify-roi', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      message: 'Failed to calculate model',
    }));
    error.status = response.status;
    throw error;
  }

  return response.json();
};

/**
 * Exports a model in a specified format.
 */
export const exportModel = async (request: ExportModelRequest): Promise<ExportModelResponse> => {
  const response = await fetch('/api/export-model', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      message: 'Failed to export model',
    }));
    error.status = response.status;
    throw error;
  }

  return response.json();
};
