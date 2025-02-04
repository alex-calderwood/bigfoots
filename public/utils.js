function logMsg(prefix, msg, ...rest) { 
    if (msg?.type === 'audio' || msg?.type === 'audioData') return;
    console.log(prefix, msg, ...rest);
 }

 const createAudioMeter = (() => {
    const meterIntervals = new WeakMap();
    
    return function(audioContext, parentElement) {
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 32;
        const analyzerData = new Uint8Array(analyser.frequencyBinCount);
        
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.gap = '3px';
        container.style.alignItems = 'center'; 
        container.style.justifyContent = 'center';
        container.style.height = '40px';
        container.style.margin = '10px';
        container.style.flexGrow = '1';
        
        // Each bar is now a container with two rectangles
        const bars = Array.from({length: 5}, () => {
            const barContainer = document.createElement('div');
            barContainer.style.display = 'flex';
            barContainer.style.flexDirection = 'column';
            barContainer.style.alignItems = 'center';
            barContainer.style.height = '40px';
            barContainer.style.justifyContent = 'center';

            // Top half
            const topBar = document.createElement('div');
            topBar.style.width = '4px';
            topBar.style.backgroundColor = '#666';
            topBar.style.height = '1px';
            topBar.style.borderRadius = '2px';
            topBar.style.transition = 'height 0.05s';

            // Bottom half
            const bottomBar = document.createElement('div');
            bottomBar.style.width = '4px';
            bottomBar.style.backgroundColor = '#666';
            bottomBar.style.height = '1px';
            bottomBar.style.borderRadius = '2px';
            bottomBar.style.transition = 'height 0.05s';

            barContainer.appendChild(topBar);
            barContainer.appendChild(bottomBar);
            container.appendChild(barContainer);
            
            return {top: topBar, bottom: bottomBar};
        });
        
        parentElement.appendChild(container);
        
        function updateBars() {
            analyser.getByteFrequencyData(analyzerData);
            const level = analyzerData.slice(0, 3)
                .reduce((a, b) => a + b, 0) / (3 * 255);
                
            bars.forEach((bar, i) => {
                const distance = Math.abs(i - 2);
                const scale = 1 - (distance / 5);
                const height = Math.min(15, (level * scale * 30)); // Half height since we're splitting it
                
                bar.top.style.height = height + 'px';
                bar.bottom.style.height = height + 'px';
            });
        }
        
        const intervalId = setInterval(updateBars, 50);
        meterIntervals.set(container, intervalId);
        
        return analyser;
    }
})();