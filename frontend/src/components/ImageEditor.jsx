import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { Slider, ToggleSwitch, Button, Spinner, Tabs } from './components/ui';

// Image processing API service
import { 
  uploadImage, 
  applyFilter, 
  getProcessingHistory, 
  getImageById,
  detectObjects,
  saveCustomWorkflow
} from '../services/imageProcessingApi';

const ImageEditor = () => {
  const queryClient = useQueryClient();
  const [currentImage, setCurrentImage] = useState(null);
  const [originalImage, setOriginalImage] = useState(null);
  const [selectedTab, setSelectedTab] = useState('adjust');
  const [processingSettings, setProcessingSettings] = useState({
    brightness: 0,
    contrast: 0,
    saturation: 0,
    sharpness: 0,
    selectedFilter: null,
    cropDimensions: null,
  });
  const [previewMode, setPreviewMode] = useState('split'); // 'split', 'side-by-side', 'before-after'
  const [isProcessing, setIsProcessing] = useState(false);
  const [objectDetectionResults, setObjectDetectionResults] = useState(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [customWorkflowName, setCustomWorkflowName] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  
  // Handle file uploads
  const onDrop = useCallback(acceptedFiles => {
    if (acceptedFiles?.length) {
      const file = acceptedFiles[0];
      const reader = new FileReader();
      
      reader.onload = () => {
        const img = new Image();
        img.src = reader.result;
        img.onload = () => {
          setOriginalImage({
            src: reader.result,
            file,
            width: img.width,
            height: img.height,
          });
          setCurrentImage({
            src: reader.result,
            file,
            width: img.width,
            height: img.height,
          });
          // Reset processing settings when new image is loaded
          setProcessingSettings({
            brightness: 0,
            contrast: 0,
            saturation: 0,
            sharpness: 0,
            selectedFilter: null,
            cropDimensions: null,
          });
          setObjectDetectionResults(null);
        };
      };
      
      reader.readAsDataURL(file);
    }
  }, []);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp']
    },
    maxFiles: 1,
    maxSize: 10485760, // 10MB
  });
  
  // Upload image mutation
  const uploadMutation = useMutation({
    mutationFn: uploadImage,
    onSuccess: (data) => {
      toast.success('Image uploaded successfully');
      queryClient.invalidateQueries(['processingHistory']);
      setCurrentImage(prev => ({
        ...prev,
        id: data.imageId
      }));
    },
    onError: (error) => {
      toast.error(`Upload failed: ${error.message}`);
    }
  });
  
  // Apply filter mutation
  const filterMutation = useMutation({
    mutationFn: applyFilter,
    onSuccess: (data) => {
      setIsProcessing(false);
      setCurrentImage(prev => ({
        ...prev,
        src: `data:image/jpeg;base64,${data.processedImage}`,
        id: data.imageId
      }));
      toast.success('Filter applied successfully');
      queryClient.invalidateQueries(['processingHistory']);
    },
    onError: (error) => {
      setIsProcessing(false);
      toast.error(`Processing failed: ${error.message}`);
    }
  });
  
  // Object detection mutation
  const detectObjectsMutation = useMutation({
    mutationFn: detectObjects,
    onSuccess: (data) => {
      setIsProcessing(false);
      setObjectDetectionResults(data.detections);
      toast.success(`${data.detections.length} objects detected`);
    },
    onError: (error) => {
      setIsProcessing(false);
      toast.error(`Object detection failed: ${error.message}`);
    }
  });
  
  // Save custom workflow mutation
  const saveWorkflowMutation = useMutation({
    mutationFn: saveCustomWorkflow,
    onSuccess: () => {
      toast.success('Custom workflow saved successfully');
      setCustomWorkflowName('');
    },
    onError: (error) => {
      toast.error(`Failed to save workflow: ${error.message}`);
    }
  });
  
  // Fetch processing history
  const { data: processingHistory } = useQuery({
    queryKey: ['processingHistory'],
    queryFn: getProcessingHistory,
    enabled: !!currentImage?.id
  });
  
  // Apply processing settings to image
  const applyProcessingSettings = useCallback(() => {
    if (!currentImage || !originalImage) return;
    
    setIsProcessing(true);
    
    const settings = {
      imageId: currentImage.id,
      operations: [
        {
          type: 'adjust',
          params: {
            brightness: processingSettings.brightness,
            contrast: processingSettings.contrast,
            saturation: processingSettings.saturation,
            sharpness: processingSettings.sharpness
          }
        }
      ]
    };
    
    // Add filter if selected
    if (processingSettings.selectedFilter) {
      settings.operations.push({
        type: 'filter',
        params: {
          name: processingSettings.selectedFilter
        }
      });
    }
    
    // Add crop if dimensions specified
    if (processingSettings.cropDimensions) {
      settings.operations.push({
        type: 'crop',
        params: processingSettings.cropDimensions
      });
    }
    
    filterMutation.mutate(settings);
  }, [currentImage, originalImage, processingSettings, filterMutation]);
  
  // Handle file upload
  const handleUpload = useCallback(() => {
    if (!currentImage?.file) return;
    
    const formData = new FormData();
    formData.append('image', currentImage.file);
    uploadMutation.mutate(formData);
  }, [currentImage, uploadMutation]);
  
  // Run object detection
  const handleObjectDetection = useCallback(() => {
    if (!currentImage?.id) return;
    
    setIsProcessing(true);
    detectObjectsMutation.mutate({ imageId: currentImage.id });
  }, [currentImage, detectObjectsMutation]);
  
  // Save current settings as custom workflow
  const handleSaveWorkflow = useCallback(() => {
    if (!customWorkflowName.trim()) {
      toast.error('Please provide a name for your workflow');
      return;
    }
    
    const workflow = {
      name: customWorkflowName,
      operations: [
        {
          type: 'adjust',
          params: {
            brightness: processingSettings.brightness,
            contrast: processingSettings.contrast,
            saturation: processingSettings.saturation,
            sharpness: processingSettings.sharpness
          }
        }
      ]
    };
    
    if (processingSettings.selectedFilter) {
      workflow.operations.push({
        type: 'filter',
        params: {
          name: processingSettings.selectedFilter
        }
      });
    }
    
    saveWorkflowMutation.mutate(workflow);
  }, [customWorkflowName, processingSettings, saveWorkflowMutation]);
  
  // Reset to original image
  const handleReset = useCallback(() => {
    if (!originalImage) return;
    
    setCurrentImage({
      ...originalImage
    });
    setProcessingSettings({
      brightness: 0,
      contrast: 0,
      saturation: 0,
      sharpness: 0,
      selectedFilter: null,
      cropDimensions: null,
    });
    setObjectDetectionResults(null);
  }, [originalImage]);
  
  // Render object detection boxes
  useEffect(() => {
    if (!objectDetectionResults || !canvasRef.current || !imageRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = imageRef.current;
    
    canvas.width = img.width;
    canvas.height = img.height;
    
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    // Draw bounding boxes
    objectDetectionResults.forEach(obj => {
      const { x, y, width, height, class: label, confidence } = obj;
      
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);
      
      ctx.fillStyle = 'rgba(0, 255, 255, 0.5)';
      ctx.fillRect(x, y - 20, 150, 20);
      
      ctx.fillStyle = '#000000';
      ctx.font = '14px Arial';
      ctx.fillText(`${label} (${Math.round(confidence * 100)}%)`, x + 5, y - 5);
    });
  }, [objectDetectionResults]);
  
  // UI Sections
  const renderImageUpload = () => (
    <div 
      {...getRootProps()} 
      className={`upload-area ${isDragActive ? 'active' : ''} ${currentImage ? 'has-image' : ''}`}
    >
      <input {...getInputProps()} />
      <div className="upload-content">
        {isDragActive ? (
          <p>Drop the image here...</p>
        ) : currentImage ? (
          <p>Drag & drop a new image, or click to select</p>
        ) : (
          <>
            <svg 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              className="upload-icon"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <h3>Drag & drop an image here</h3>
            <p>or click to select a file</p>
            <span className="file-specs">JPEG, PNG, GIF up to 10MB</span>
          </>
        )}
      </div>
    </div>
  );
  
  const renderEditorControls = () => (
    <div className="editor-controls">
      <Tabs
        tabs={[
          { id: 'adjust', label: 'Adjust' },
          { id: 'filters', label: 'Filters' },
          { id: 'crop', label: 'Crop' },
          { id: 'effects', label: 'Effects' },
          { id: 'ai', label: 'AI Tools' },
        ]}
        activeTab={selectedTab}
        onChange={setSelectedTab}
      />
      
      <div className="controls-content">
        {selectedTab === 'adjust' && (
          <div className="adjust-controls">
            <div className="slider-control">
              <label>Brightness</label>
              <Slider 
                min={-100} 
                max={100} 
                value={processingSettings.brightness} 
                onChange={val => setProcessingSettings(prev => ({ ...prev, brightness: val }))}
              />
            </div>
            
            <div className="slider-control">
              <label>Contrast</label>
              <Slider 
                min={-100} 
                max={100} 
                value={processingSettings.contrast} 
                onChange={val => setProcessingSettings(prev => ({ ...prev, contrast: val }))}
              />
            </div>
            
            <div className="slider-control">
              <label>Saturation</label>
              <Slider 
                min={-100} 
                max={100} 
                value={processingSettings.saturation} 
                onChange={val => setProcessingSettings(prev => ({ ...prev, saturation: val }))}
              />
            </div>
            
            <div className="slider-control">
              <label>Sharpness</label>
              <Slider 
                min={-100} 
                max={100} 
                value={processingSettings.sharpness} 
                onChange={val => setProcessingSettings(prev => ({ ...prev, sharpness: val }))}
              />
            </div>
          </div>
        )}
        
        {selectedTab === 'filters' && (
          <div className="filters-controls">
            <div className="filter-grid">
              {['None', 'Grayscale', 'Sepia', 'Vintage', 'Dramatic', 'Vivid', 'Cool', 'Warm', 'Film', 'B&W Portrait'].map(filter => (
                <div 
                  key={filter} 
                  className={`filter-item ${processingSettings.selectedFilter === filter ? 'selected' : ''}`}
                  onClick={() => setProcessingSettings(prev => ({ ...prev, selectedFilter: filter === 'None' ? null : filter }))}
                >
                  <div className="filter-preview" style={{ filter: getFilterStyle(filter) }}></div>
                  <span>{filter}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {selectedTab === 'crop' && (
          <div className="crop-controls">
            <div className="aspect-ratio-selectors">
              <button 
                className={!processingSettings.cropDimensions ? 'active' : ''} 
                onClick={() => setProcessingSettings(prev => ({ ...prev, cropDimensions: null }))}
              >
                Original
              </button>
              <button 
                className={processingSettings.cropDimensions?.aspectRatio === '1:1' ? 'active' : ''}
                onClick={() => setProcessingSettings(prev => ({ 
                  ...prev, 
                  cropDimensions: { aspectRatio: '1:1' } 
                }))}
              >
                1:1
              </button>
              <button 
                className={processingSettings.cropDimensions?.aspectRatio === '16:9' ? 'active' : ''}
                onClick={() => setProcessingSettings(prev => ({ 
                  ...prev, 
                  cropDimensions: { aspectRatio: '16:9' } 
                }))}
              >
                16:9
              </button>
              <button 
                className={processingSettings.cropDimensions?.aspectRatio === '4:3' ? 'active' : ''}
                onClick={() => setProcessingSettings(prev => ({ 
                  ...prev, 
                  cropDimensions: { aspectRatio: '4:3' } 
                }))}
              >
                4:3
              </button>
              <button 
                className={processingSettings.cropDimensions?.aspectRatio === '3:2' ? 'active' : ''}
                onClick={() => setProcessingSettings(prev => ({ 
                  ...prev, 
                  cropDimensions: { aspectRatio: '3:2' } 
                }))}
              >
                3:2
              </button>
              <button
                className={processingSettings.cropDimensions?.aspectRatio === 'custom' ? 'active' : ''}
                onClick={() => setProcessingSettings(prev => ({ 
                  ...prev, 
                  cropDimensions: { aspectRatio: 'custom' } 
                }))}
              >
                Custom
              </button>
            </div>
            
            <div className="crop-preview">
              {currentImage && (
                <div className="crop-image-container">
                  <img src={currentImage.src} alt="Crop preview" />
                  {processingSettings.cropDimensions && (
                    <div className="crop-overlay" style={{
                      aspectRatio: processingSettings.cropDimensions.aspectRatio === 'custom' ? 'auto' : processingSettings.cropDimensions.aspectRatio.replace(':', '/')
                    }}></div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        
        {selectedTab === 'ai' && (
          <div className="ai-controls">
            <div className="ai-option">
              <h4>Object Detection</h4>
              <p>Detect and label objects in your image using machine learning</p>
              <Button onClick={handleObjectDetection} disabled={!currentImage?.id || isProcessing}>
                {isProcessing ? <Spinner size="sm" /> : 'Detect Objects'}
              </Button>
            </div>
            
            <div className="ai-option">
              <h4>Smart Enhance</h4>
              <p>Automatically enhance your image using AI</p>
              <Button 
                variant="secondary" 
                onClick={() => {
                  toast('AI image enhancement coming soon!', { icon: '🚀' });
                }}
                disabled={!currentImage?.id}
              >
                Enhance with AI
              </Button>
            </div>
            
            <div className="ai-option">
              <h4>Style Transfer</h4>
              <p>Apply artistic styles to your image using neural networks</p>
              <div className="style-preview-grid">
                {['Cubism', 'Impressionist', 'Starry Night', 'Pop Art'].map(style => (
                  <div key={style} className="style-preview-item">
                    <div className="style-preview-image"></div>
                    <span>{style}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        <div className="action-buttons">
          <Button variant="secondary" onClick={handleReset} disabled={!currentImage}>
            Reset
          </Button>
          <Button 
            onClick={applyProcessingSettings} 
            disabled={!currentImage?.id || isProcessing}
          >
            {isProcessing ? <Spinner size="sm" /> : 'Apply Changes'}
          </Button>
        </div>
        
        <div className="advanced-options">
          <button 
            className="toggle-advanced"
            onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
          >
            {showAdvancedOptions ? 'Hide Advanced Options' : 'Show Advanced Options'}
          </button>
          
          {showAdvancedOptions && (
            <div className="advanced-panel">
              <div className="preview-mode-selector">
                <h4>Preview Mode</h4>
                <div className="button-group">
                  <button
                    className={previewMode === 'split' ? 'active' : ''}
                    onClick={() => setPreviewMode('split')}
                  >
                    Split View
                  </button>
                  <button
                    className={previewMode === 'side-by-side' ? 'active' : ''}
                    onClick={() => setPreviewMode('side-by-side')}
                  >
                    Side by Side
                  </button>
                  <button
                    className={previewMode === 'before-after' ? 'active' : ''}
                    onClick={() => setPreviewMode('before-after')}
                  >
                    Before/After
                  </button>
                </div>
              </div>
              
              <div className="custom-workflow">
                <h4>Save Custom Workflow</h4>
                <div className="workflow-input">
                  <input
                    type="text"
                    placeholder="Workflow name"
                    value={customWorkflowName}
                    onChange={(e) => setCustomWorkflowName(e.target.value)}
                  />
                  <Button onClick={handleSaveWorkflow} disabled={!customWorkflowName.trim()}>
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  
  const renderImagePreview = () => (
    <div className={`image-preview ${previewMode}`}>
      {currentImage ? (
        <>
          <div className="preview-container">
            {previewMode === 'split' && originalImage && (
              <div className="split-view">
                <div className="original-half">
                  <img src={originalImage.src} alt="Original" />
                </div>
                <div className="processed-half">
                  <img 
                    ref={imageRef}
                    src={currentImage.src} 
                    alt="Processed" 
                    className={objectDetectionResults ? 'hidden' : ''}
                  />
                  {objectDetectionResults && (
                    <canvas 
                      ref={canvasRef} 
                      className="detection-canvas"
                    />
                  )}
                </div>
                <div className="divider"></div>
              </div>
            )}
            
            {previewMode === 'side-by-side' && (
              <div className="side-by-side-view">
                {originalImage && (
                  <div className="preview-image">
                    <img src={originalImage.src} alt="Original" />
                    <span className="preview-label">Original</span>
                  </div>
                )}
                <div className="preview-image">
                  <img 
                    ref={imageRef}
                    src={currentImage.src} 
                    alt="Processed" 
                    className={objectDetectionResults ? 'hidden' : ''}
                  />
                  {objectDetectionResults && (
                    <canvas 
                      ref={canvasRef} 
                      className="detection-canvas"
                    />
                  )}
                  <span className="preview-label">Processed</span>
                </div>
              </div>
            )}
            
            {previewMode === 'before-after' && (
              <div className="before-after-view">
                <img 
                  ref={imageRef}
                  src={currentImage.src} 
                  alt="Processed" 
                  className={objectDetectionResults ? 'hidden' : ''}
                />
                {objectDetectionResults && (
                  <canvas 
                    ref={canvasRef} 
                    className="detection-canvas"
                  />
                )}
                <button 
                  className="before-button"
                  onMouseDown={() => originalImage && setCurrentImage(originalImage)}
                  onMouseUp={() => originalImage && setCurrentImage(prev => ({ ...prev }))}
                  onMouseLeave={() => originalImage && setCurrentImage(prev => ({ ...prev }))}
                >
                  Show Original
                </button>
              </div>
            )}
          </div>
          
          <div className="image-info">
            <div className="dimensions">
              {currentImage.width} × {currentImage.height}
            </div>
            
            <button
              className="fullscreen-toggle"
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </button>
          </div>
          
          {!currentImage.id && (
            <div className="upload-prompt">
              <Button onClick={handleUpload} variant="primary">
                Upload to Begin Editing
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="empty-preview">
          <p>Upload an image to start editing</p>
        </div>
      )}
    </div>
  );
  
  // Helper function to get CSS filter string
  const getFilterStyle = (filterName) => {
    switch (filterName) {
      case 'Grayscale':
        return 'grayscale(100%)';
      case 'Sepia':
        return 'sepia(100%)';
      case 'Vintage':
        return 'sepia(40%) brightness(90%) contrast(95%)';
      case 'Dramatic':
        return 'contrast(140%) brightness(90%) saturate(130%)';
      case 'Vivid':
        return 'saturate(180%) brightness(105%) contrast(110%)';
      case 'Cool':
        return 'saturate(90%) hue-rotate(30deg) brightness(105%)';
      case 'Warm':
        return 'saturate(110%) hue-rotate(-15deg) brightness(105%)';
      case 'Film':
        return 'contrast(110%) brightness(95%) saturate(85%)';
      case 'B&W Portrait':
        return 'grayscale(100%) contrast(120%) brightness(105%)';
      default:
        return 'none';
    }
  };
  
  return (
    <motion.div 
      className={`image-editor ${isFullscreen ? 'fullscreen' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="editor-layout">
        <div className="left-panel">
          {renderImageUpload()}
          {
            // Processing history would be shown here when implemented
            processingHistory && processingHistory.length > 0 && (
              <div className="processing-history">
                <h3>Recent Edits</h3>
                <div className="history-items">
                  {processingHistory.map(item => (
                    <div key={item.id} className="history-item">
                      <img src={item.thumbnailUrl} alt="History thumbnail" />
                      <div className="history-item-info">
                        <span>{item.operationName}</span>
                        <small>{new Date(item.timestamp).toLocaleString()}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          }
        </div>
        
        <div className="main-panel">
          {renderImagePreview()}
        </div>
        
        <div className="right-panel">
          {renderEditorControls()}
        </div>
      </div>
    </motion.div>
  );
};

export default ImageEditor;